import type { IncomingMessage } from 'node:http';
import { Transform } from 'node:stream';
import { Injectable } from '@nestjs/common';
import {
  Configuration,
  HttpCrawler,
  Log,
  LogLevel,
  type HttpCrawlingContext,
  type Request,
} from '@crawlee/http';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { asWebFetchError, WebFetchError } from './web-fetch.error';
import { WebFetchUrlGuard } from './web-fetch-url.guard';
import type { GuardedWebUrl, WebFetchTransportResult } from './web-fetch.types';

type FetchRequestData = { index: number; requestedUrl: string };
const REQUEST_LABEL = 'WEB_FETCH' as const;

// 在 Crawlee 缓冲正文前为响应流增加解压后字节上限。
class BoundedHttpCrawler extends HttpCrawler<HttpCrawlingContext<FetchRequestData>> {
  protected override async _parseResponse(
    request: Request,
    responseStream: IncomingMessage,
    context: HttpCrawlingContext<FetchRequestData>,
  ) {
    const declared = Number(responseStream.headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > WEB_FETCH_POLICY.maxResponseBytes) {
      responseStream.destroy();
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchResponseTooLarge,
        '网页响应超过允许大小。',
      );
    }
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > WEB_FETCH_POLICY.maxResponseBytes) {
          callback(new WebFetchError(
            AGENT_ERROR_CODES.fetchResponseTooLarge,
            '网页响应超过允许大小。',
          ));
          return;
        }
        callback(null, chunk);
      },
    });
    for (const property of [
      'statusCode', 'statusMessage', 'headers', 'rawHeaders', 'trailers', 'rawTrailers',
      'httpVersion', 'httpVersionMajor', 'httpVersionMinor', 'url', 'complete',
    ] as const) {
      if (property in responseStream) {
        Object.defineProperty(limiter, property, {
          configurable: true,
          writable: true,
          value: responseStream[property],
        });
      }
    }
    responseStream.on('error', (error) => limiter.destroy(error));
    limiter.on('error', (error) => responseStream.destroy(error));
    responseStream.pipe(limiter);
    return super._parseResponse(request, limiter as unknown as IncomingMessage, context);
  }
}

@Injectable()
export class CrawleeWebContentFetcher {
  constructor(private readonly guard: WebFetchUrlGuard) {}

  // 使用无持久化 HttpCrawler 并发抓取已通过初始校验的少量 URL。
  async fetchAll(
    targets: GuardedWebUrl[],
    signal?: AbortSignal,
  ): Promise<WebFetchTransportResult[]> {
    if (signal?.aborted) throw this.cancelledError();
    const results = new Map<number, WebFetchTransportResult>();
    const errors = new Map<string, WebFetchError>();
    const configuration = new Configuration({
      persistStorage: false,
      purgeOnStart: false,
      logLevel: LogLevel.OFF,
    });
    const crawler = new BoundedHttpCrawler({
      maxConcurrency: WEB_FETCH_POLICY.maxConcurrency,
      maxRequestRetries: WEB_FETCH_POLICY.maxRequestRetries,
      maxRequestsPerCrawl: targets.length,
      navigationTimeoutSecs: WEB_FETCH_POLICY.timeoutMs / 1_000,
      requestHandlerTimeoutSecs: WEB_FETCH_POLICY.timeoutMs / 1_000,
      useSessionPool: false,
      persistCookiesPerSession: false,
      retryOnBlocked: false,
      log: new Log({ level: LogLevel.OFF }),
      ignoreSslErrors: false,
      additionalMimeTypes: ['text/plain'],
      preNavigationHooks: [async ({ request }, gotOptions) => {
        gotOptions.maxRedirects = WEB_FETCH_POLICY.maxRedirects;
        gotOptions.headers = {
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'user-agent': 'HelloHarnessAgent-WebFetch/1.0',
        };
        gotOptions.hooks ??= {};
        const existing = gotOptions.hooks.beforeRedirect ?? [];
        gotOptions.hooks.beforeRedirect = [
          ...existing,
          async (options: { url: URL }, response: { url: string }) => {
            const nextUrl = options.url.toString();
            const previousUrl = response.url;
            if (previousUrl.startsWith('https:') && nextUrl.startsWith('http:')) {
              request.noRetry = true;
              throw new WebFetchError(
                AGENT_ERROR_CODES.fetchRedirectNotAllowed,
                '网页重定向发生不安全的协议降级。',
              );
            }
            await this.guard.validate(nextUrl, true);
          },
        ];
      }],
      requestHandler: async ({ request, response, body, contentType }) => {
        const data = request.userData as FetchRequestData;
        const statusCode = response.statusCode ?? 0;
        if (statusCode === 429) {
          request.noRetry = true;
          throw new WebFetchError(
            AGENT_ERROR_CODES.fetchTooManyRequests,
            '网页来源暂时限制访问频率。',
          );
        }
        if (statusCode >= 400) {
          request.noRetry = statusCode < 500;
          throw new WebFetchError(
            AGENT_ERROR_CODES.fetchUpstreamFailed,
            '网页来源返回不可用响应。',
            statusCode >= 500,
          );
        }
        if (!WEB_FETCH_POLICY.allowedContentTypes.includes(
          contentType.type as typeof WEB_FETCH_POLICY.allowedContentTypes[number],
        )) {
          request.noRetry = true;
          throw new WebFetchError(
            AGENT_ERROR_CODES.fetchUnsupportedContentType,
            '网页内容类型暂不支持。',
          );
        }
        const text = Buffer.isBuffer(body) ? body.toString(contentType.encoding) : body;
        if (!text.trim()) {
          request.noRetry = true;
          throw new WebFetchError(AGENT_ERROR_CODES.fetchContentEmpty, '网页响应没有可用正文。');
        }
        const nulCount = Array.from(text).filter((character) => character === '\0').length;
        if (nulCount > Math.max(2, text.length * 0.01)) {
          request.noRetry = true;
          throw new WebFetchError(
            AGENT_ERROR_CODES.fetchUnsupportedContentType,
            '网页响应不是可读取的文本内容。',
          );
        }
        results.set(data.index, {
          status: 'succeeded',
          content: {
            requestedUrl: data.requestedUrl,
            finalUrl: request.loadedUrl ?? request.url,
            contentType: contentType.type,
            body: text,
            retrievedAt: new Date().toISOString(),
          },
        });
      },
      errorHandler: async ({ request }, error) => {
        const normalized = this.classifyError(error, signal);
        errors.set(request.id, normalized);
        if (!normalized.retryable) request.noRetry = true;
      },
      failedRequestHandler: async ({ request }, error) => {
        const data = request.userData as FetchRequestData;
        const normalized = errors.get(request.id) ?? this.classifyError(error, signal);
        results.set(data.index, {
          status: 'failed',
          requestedUrl: data.requestedUrl,
          code: normalized.code,
          detail: normalized.message,
        });
      },
    }, configuration);
    const cancel = (): void => { void crawler.teardown(); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await crawler.run(targets.map((target, index) => ({
        url: target.normalizedUrl,
        uniqueKey: `${REQUEST_LABEL}-${index}`,
        label: REQUEST_LABEL,
        userData: { index, requestedUrl: target.requestedUrl } satisfies FetchRequestData,
        headers: {},
      })));
      if (signal?.aborted) throw this.cancelledError();
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
    return targets.map((target, index) => results.get(index) ?? ({
      status: 'failed',
      requestedUrl: target.requestedUrl,
      code: AGENT_ERROR_CODES.fetchUpstreamFailed,
      detail: '网页读取未返回结果。',
    }));
  }

  // 将 Crawlee、网络和取消异常转换为稳定且不泄露上游细节的错误。
  private classifyError(error: unknown, signal?: AbortSignal): WebFetchError {
    if (signal?.aborted) return this.cancelledError();
    if (error instanceof WebFetchError) return error;
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (name.includes('Timeout') || message.includes('timed out') || message.includes('timeout')) {
      return new WebFetchError(AGENT_ERROR_CODES.fetchTimeout, '网页读取超时。', true);
    }
    if (message.includes('redirect')) {
      return new WebFetchError(
        AGENT_ERROR_CODES.fetchRedirectNotAllowed,
        '网页重定向不符合安全策略。',
      );
    }
    if (message.includes('content-type') || message.includes('mime type')) {
      return new WebFetchError(
        AGENT_ERROR_CODES.fetchUnsupportedContentType,
        '网页内容类型暂不支持。',
      );
    }
    return asWebFetchError(
      error,
      AGENT_ERROR_CODES.fetchUpstreamFailed,
      '网页来源暂时无法读取。',
    );
  }

  // 构造整个批次被调用方取消时使用的稳定异常。
  private cancelledError(): WebFetchError {
    return new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。');
  }
}
