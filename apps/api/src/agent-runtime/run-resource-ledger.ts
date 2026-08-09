import {
  AGENT_ERROR_CODES,
  normalizeSourceUrl,
} from '@harness/agent-protocol';
import type {
  WebFetchBudget,
  WebFetchSkippedItem,
  WebFetchStopReason,
} from '@harness/agent-protocol';

type UrlReservation =
  | { status: 'accepted'; requestedUrl: string }
  | { status: 'skipped'; result: WebFetchSkippedItem };

// 保存单次非持久化 Agent 运行的外部调查资源状态。
export class RunResourceLedger {
  private readonly allowedFetchUrlKeys = new Set<string>();
  private readonly acceptedUrlKeys = new Set<string>();
  private readonly documentUrlKeys = new Set<string>();
  private readonly contentHashes = new Set<string>();
  private networkAttempts = 0;
  private successfulUniqueDocuments = 0;
  private passageCharacters = 0;
  private consecutiveEmptyFetches = 0;
  private stopReason?: WebFetchStopReason;

  constructor(
    private readonly urlLimit: number,
    private readonly passageCharacterLimit: number,
  ) {}

  // 只有用户明确提供或本轮搜索发现的 URL 才能成为 Fetch 候选。
  allowFetchUrls(urls: string[]): void {
    for (const url of urls) {
      try { this.allowedFetchUrlKeys.add(normalizeSourceUrl(url)); }
      catch { /* 非法 URL 由输入协议或 URL Guard 返回正式错误。 */ }
    }
  }

  reserveUrls(urls: string[]): UrlReservation[] {
    const reservations = urls.map((requestedUrl): UrlReservation => {
      if (this.stopReason === 'context_budget') {
        return {
          status: 'skipped',
          result: this.skipped(
            requestedUrl,
            AGENT_ERROR_CODES.agentExternalContextBudgetExceeded,
            '本轮可用于网页原文的上下文预算已经用完。',
          ),
        };
      }
      if (this.stopReason) {
        return {
          status: 'skipped',
          result: this.skipped(requestedUrl, AGENT_ERROR_CODES.fetchBudgetExceeded, '本轮联网调查已经停止。'),
        };
      }
      const key = normalizeSourceUrl(requestedUrl);
      if (!this.allowedFetchUrlKeys.has(key)) {
        return {
          status: 'skipped',
          result: this.skipped(
            requestedUrl,
            AGENT_ERROR_CODES.fetchUrlNotAllowed,
            '网页地址不是用户提供的直链，也不在本轮搜索线索中。',
          ),
        };
      }
      if (this.acceptedUrlKeys.has(key) || this.documentUrlKeys.has(key)) {
        return {
          status: 'skipped',
          result: this.skipped(requestedUrl, AGENT_ERROR_CODES.fetchDuplicateSkipped, '本轮已读取过等价网页。'),
        };
      }
      if (this.acceptedUrlKeys.size >= this.urlLimit) {
        this.stopReason ??= 'url_budget';
        return {
          status: 'skipped',
          result: this.skipped(requestedUrl, AGENT_ERROR_CODES.fetchBudgetExceeded, '网页读取已达到本轮 URL 上限。'),
        };
      }
      this.acceptedUrlKeys.add(key);
      return { status: 'accepted', requestedUrl };
    });
    if (this.acceptedUrlKeys.size >= this.urlLimit) this.stopReason ??= 'url_budget';
    return reservations;
  }

  registerNetworkAttempts(count: number): void {
    this.networkAttempts += Math.max(0, count);
  }

  // 返回 false 表示该网页与本轮已接受的最终地址或正文完全重复。
  registerDocument(input: {
    requestedUrl: string;
    finalUrl: string;
    normalizedUrl: string;
    contentHash: string;
  }): boolean {
    const aliases = [input.finalUrl, input.normalizedUrl].map(normalizeSourceUrl);
    if (this.contentHashes.has(input.contentHash) || aliases.some((key) => this.documentUrlKeys.has(key))) {
      return false;
    }
    for (const key of [normalizeSourceUrl(input.requestedUrl), ...aliases]) this.documentUrlKeys.add(key);
    this.contentHashes.add(input.contentHash);
    this.successfulUniqueDocuments += 1;
    return true;
  }

  registerPassageCharacters(count: number): void {
    this.passageCharacters += Math.max(0, count);
    if (this.remainingPassageCharacters() < 2_000) this.stopReason ??= 'context_budget';
  }

  registerFetchGain(newDocumentCount: number): void {
    this.consecutiveEmptyFetches = newDocumentCount > 0 ? 0 : this.consecutiveEmptyFetches + 1;
    if (this.consecutiveEmptyFetches >= 2) this.stopReason ??= 'no_new_content';
  }

  markStopped(reason: WebFetchStopReason): void {
    this.stopReason = reason;
  }

  remainingPassageCharacters(): number {
    return Math.max(0, this.passageCharacterLimit - this.passageCharacters);
  }

  canFetch(): boolean {
    return !this.stopReason &&
      this.acceptedUrlKeys.size < this.urlLimit &&
      this.remainingPassageCharacters() >= 2_000;
  }

  budget(): WebFetchBudget {
    const used = this.acceptedUrlKeys.size;
    return {
      urls: { used, limit: this.urlLimit, remaining: Math.max(0, this.urlLimit - used) },
      passages: {
        usedCharacters: this.passageCharacters,
        limitCharacters: this.passageCharacterLimit,
        remainingCharacters: this.remainingPassageCharacters(),
      },
      successfulUniqueDocuments: this.successfulUniqueDocuments,
      networkAttempts: this.networkAttempts,
      canFetch: this.canFetch(),
      ...(this.stopReason ? { stopReason: this.stopReason } : {}),
    };
  }

  private skipped(requestedUrl: string, code: string, detail: string): WebFetchSkippedItem {
    return { status: 'skipped', requestedUrl, code, detail };
  }
}
