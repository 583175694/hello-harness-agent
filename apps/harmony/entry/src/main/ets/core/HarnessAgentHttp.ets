import { util } from '@kit.ArkTS';
import { http } from '@kit.NetworkKit';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { RunStreamEventRow } from './HarmonyCoreTypes';

export type JsonBody = Record<string, string | number | boolean | Object | null | undefined>;

export interface HarnessProblemDetails {
  title: string;
  detail: string;
}

/** B0～B1 文档允许的 ArkTS 薄 HTTP（REST + SSE；golden 仍在 JVM mobile-core）。 */
export class HarnessAgentHttp {
  static normalizeBase(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  static baseUrl(): string {
    return HarnessAgentHttp.normalizeBase(PreviewLocalPreferences.apiUrl);
  }

  static cookieHeader(): string | undefined {
    const token = PreviewLocalPreferences.sessionToken.trim();
    if (token.length === 0) {
      return undefined;
    }
    return `harness_session=${token}`;
  }

  static randomClientId(): string {
    return `m-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  /** E9：401 / AUTH_REQUIRED（REST 或 SSE）。 */
  static isAuthRequiredFromError(error: Object): boolean {
    const message = error instanceof Error ? error.message : `${error}`;
    if (/^SSE HTTP 401\b/.test(message) || /^HTTP 401:/.test(message)) {
      return true;
    }
    const match = /^HTTP (\d+):([\s\S]*)$/.exec(message);
    if (match === null) {
      return false;
    }
    if (match[1] === '401') {
      return true;
    }
    const body = match[2].trim();
    if (body.length === 0) {
      return false;
    }
    try {
      const parsed = JSON.parse(body) as Record<string, string | number>;
      return parsed['status'] === 401 || `${parsed['code']}` === 'AUTH_REQUIRED';
    } catch (_e) {
      return false;
    }
  }

  /** 从 postJson/getJson 抛出的 `HTTP {code}: {body}` 解析 ProblemDetails（E28 等）。 */
  static problemFromThrownError(error: Object): HarnessProblemDetails {
    const message = error instanceof Error ? error.message : `${error}`;
    if (/^SSE HTTP 401\b/.test(message)) {
      return { title: '登录已失效', detail: '请重新登录后继续' };
    }
    const match = /^HTTP (\d+):([\s\S]*)$/.exec(message);
    if (match === null) {
      return { title: '请求失败', detail: message };
    }
    const code = match[1];
    const body = match[2].trim();
    if (body.length === 0) {
      return { title: '请求失败', detail: `HTTP ${code}` };
    }
    try {
      const parsed = JSON.parse(body) as Record<string, string | number>;
      const title = `${parsed['title'] ?? '请求失败'}`;
      const detail = `${parsed['detail'] ?? body}`;
      return { title, detail };
    } catch (_e) {
      return { title: `HTTP ${code}`, detail: body };
    }
  }

  static async getReadyz(): Promise<boolean> {
    const base = HarnessAgentHttp.baseUrl();
    if (base.length === 0) {
      return false;
    }
    const response = await HarnessAgentHttp.request(`${base}/readyz`, http.RequestMethod.GET);
    return response.code >= 200 && response.code < 300;
  }

  static async getJson<T>(path: string): Promise<T> {
    const base = HarnessAgentHttp.baseUrl();
    const response = await HarnessAgentHttp.request(`${base}${path}`, http.RequestMethod.GET);
    if (response.code < 200 || response.code >= 300) {
      throw new Error(`HTTP ${response.code}: ${response.body}`);
    }
    return JSON.parse(response.body) as T;
  }

  static async uploadSessionFile(
    sessionId: string,
    fileName: string,
    mediaType: string,
    fileData: ArrayBuffer,
  ): Promise<import('./HarmonyCoreTypes').FileRefRow> {
    const base = HarnessAgentHttp.baseUrl();
    const boundary = `----Harness${Date.now()}`;
    const prefix = HarnessAgentHttp.asciiBuffer(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mediaType}\r\n\r\n`,
    );
    const suffix = HarnessAgentHttp.asciiBuffer(`\r\n--${boundary}--\r\n`);
    const body = HarnessAgentHttp.concatArrayBuffers([prefix, fileData, suffix]);
    const client = http.createHttp();
    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    };
    const cookie = HarnessAgentHttp.cookieHeader();
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    return new Promise((resolve, reject) => {
      client.request(`${base}/api/agent/sessions/${sessionId}/files`, {
        method: http.RequestMethod.POST,
        header: headers,
        extraData: body,
        expectDataType: http.HttpDataType.STRING,
        readTimeout: 120000,
        connectTimeout: 30000,
      }, (err, data) => {
        client.destroy();
        if (err) {
          reject(err);
          return;
        }
        const code = data?.responseCode ?? 0;
        const result = typeof data?.result === 'string' ? data.result as string : '';
        if (code < 200 || code >= 300) {
          reject(new Error(`HTTP ${code}: ${result}`));
          return;
        }
        resolve(JSON.parse(result) as import('./HarmonyCoreTypes').FileRefRow);
      });
    });
  }

  private static asciiBuffer(text: string): ArrayBuffer {
    const arr = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      arr[i] = text.charCodeAt(i) & 0xff;
    }
    return arr.buffer;
  }

  private static concatArrayBuffers(parts: ArrayBuffer[]): ArrayBuffer {
    let total = 0;
    for (const part of parts) {
      total += part.byteLength;
    }
    const out = new ArrayBuffer(total);
    const view = new Uint8Array(out);
    let offset = 0;
    for (const part of parts) {
      view.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }
    return out;
  }

  static async postJson<T>(path: string, body?: JsonBody): Promise<T> {
    const base = HarnessAgentHttp.baseUrl();
    const response = await HarnessAgentHttp.request(
      `${base}${path}`,
      http.RequestMethod.POST,
      body ? JSON.stringify(body) : undefined,
    );
    if (response.code < 200 || response.code >= 300) {
      throw new Error(`HTTP ${response.code}: ${response.body}`);
    }
    if (response.body.trim().length === 0) {
      return {} as T;
    }
    return JSON.parse(response.body) as T;
  }

  static async putJson<T>(path: string, body: JsonBody): Promise<T> {
    const base = HarnessAgentHttp.baseUrl();
    const response = await HarnessAgentHttp.request(
      `${base}${path}`,
      http.RequestMethod.PUT,
      JSON.stringify(body),
    );
    if (response.code < 200 || response.code >= 300) {
      throw new Error(`HTTP ${response.code}: ${response.body}`);
    }
    if (response.body.trim().length === 0) {
      return {} as T;
    }
    return JSON.parse(response.body) as T;
  }

  static async patchJson<T>(path: string, body: JsonBody): Promise<T> {
    const base = HarnessAgentHttp.baseUrl();
    const response = await HarnessAgentHttp.request(
      `${base}${path}`,
      http.RequestMethod.PATCH,
      JSON.stringify(body),
      'application/merge-patch+json',
    );
    if (response.code < 200 || response.code >= 300) {
      throw new Error(`HTTP ${response.code}: ${response.body}`);
    }
    return JSON.parse(response.body) as T;
  }

  static async delete(path: string): Promise<void> {
    const base = HarnessAgentHttp.baseUrl();
    const response = await HarnessAgentHttp.request(`${base}${path}`, http.RequestMethod.DELETE);
    if (response.code < 200 || response.code >= 300) {
      throw new Error(`HTTP ${response.code}: ${response.body}`);
    }
  }

  static async subscribeRunEvents(
    runId: string,
    lastEventId: number | undefined,
    onEvent: (event: RunStreamEventRow) => void,
    onDone: () => void,
    onError: (message: string) => void,
    onClientReady?: (client: http.HttpRequest) => void,
  ): Promise<void> {
    const base = HarnessAgentHttp.baseUrl();
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
    };
    const cookie = HarnessAgentHttp.cookieHeader();
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    if (lastEventId !== undefined && lastEventId > 0) {
      headers['Last-Event-ID'] = `${lastEventId}`;
    }
    const client = http.createHttp();
    onClientReady?.(client);
    let buffer = '';
    return new Promise((resolve) => {
      client.on('dataReceive', (data: ArrayBuffer) => {
        const decoder = new util.TextDecoder('utf-8');
        buffer += decoder.decodeWithStream(data);
        buffer = HarnessAgentHttp.flushSseBuffer(buffer, onEvent);
      });
      client.on('headersReceive', (header: Object) => {
        const code = (header as Record<string, number>)['responseCode'] ?? 0;
        if (code < 200 || code >= 300) {
          onError(`SSE HTTP ${code}`);
          client.destroy();
        }
      });
      client.request(`${base}/api/agent/runs/${runId}/events`, {
        method: http.RequestMethod.GET,
        header: headers,
        readTimeout: 120000,
        connectTimeout: 30000,
        expectDataType: http.HttpDataType.STRING,
      }, (err, data) => {
        client.destroy();
        if (err) {
          onError(`${err.code ?? ''} ${err.message ?? 'SSE error'}`);
        } else if (data && typeof data.result === 'string') {
          buffer += data.result as string;
          HarnessAgentHttp.flushSseBuffer(buffer, onEvent);
        }
        onDone();
        resolve();
      });
    });
  }

  private static flushSseBuffer(buffer: string, onEvent: (event: RunStreamEventRow) => void): string {
    const parts = buffer.split('\n\n');
    const remainder = parts.pop() ?? '';
    for (const frame of parts) {
      const dataLines = frame.split('\n').filter((line) => line.startsWith('data:'));
      if (dataLines.length === 0) {
        continue;
      }
      const payload = dataLines.map((l) => l.replace(/^data:\s?/, '')).join('\n');
      try {
        onEvent(JSON.parse(payload) as RunStreamEventRow);
      } catch (_e) {
        // ignore malformed frames
      }
    }
    return remainder;
  }

  private static request(
    url: string,
    method: http.RequestMethod,
    body?: string,
    contentType: string = 'application/json',
  ): Promise<{ code: number; body: string }> {
    const client = http.createHttp();
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = contentType;
    }
    const cookie = HarnessAgentHttp.cookieHeader();
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    return new Promise((resolve, reject) => {
      client.request(url, {
        method,
        header: headers,
        extraData: body,
        expectDataType: http.HttpDataType.STRING,
        readTimeout: 60000,
        connectTimeout: 15000,
      }, (err, data) => {
        client.destroy();
        if (err) {
          reject(err);
          return;
        }
        const code = data?.responseCode ?? 0;
        const result = typeof data?.result === 'string' ? data.result as string : '';
        resolve({ code, body: result });
      });
    });
  }
}
