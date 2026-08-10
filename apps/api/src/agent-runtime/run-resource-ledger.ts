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

  // 初始化本轮联网调查的 URL 和原文上下文硬预算。
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

  // 预留本批次 URL，并把来源约束、重复项和运行级预算统一转换为结构化结果。
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

  // 累加实际发起的网络请求次数，缓存命中不会计入这里。
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

  // 累加注入模型上下文的原文字符数，并在剩余空间不足时停止 Fetch。
  registerPassageCharacters(count: number): void {
    this.passageCharacters += Math.max(0, count);
    if (this.remainingPassageCharacters() < 2_000) this.stopReason ??= 'context_budget';
  }

  // 根据本次 Fetch 是否产生新文档更新连续空结果计数，并触发无新内容早停。
  registerFetchGain(newDocumentCount: number): void {
    this.consecutiveEmptyFetches = newDocumentCount > 0 ? 0 : this.consecutiveEmptyFetches + 1;
    if (this.consecutiveEmptyFetches >= 2) this.stopReason ??= 'no_new_content';
  }

  // 记录本轮联网调查的确定性停止原因。
  markStopped(reason: WebFetchStopReason): void {
    this.stopReason = reason;
  }

  // 返回当前 run 还可以向模型上下文注入的原文字符数。
  remainingPassageCharacters(): number {
    return Math.max(0, this.passageCharacterLimit - this.passageCharacters);
  }

  // 判断当前 run 是否仍满足继续读取网页的基本资源条件。
  canFetch(): boolean {
    return !this.stopReason &&
      this.acceptedUrlKeys.size < this.urlLimit &&
      this.remainingPassageCharacters() >= 2_000;
  }

  // 生成对工具响应和日志可见的有界资源快照。
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

  // 构造不会触发网络请求的单 URL 跳过结果。
  private skipped(requestedUrl: string, code: string, detail: string): WebFetchSkippedItem {
    return { status: 'skipped', requestedUrl, code, detail };
  }
}
