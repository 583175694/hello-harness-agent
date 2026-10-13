import { BadRequestException, Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES, isAllowedMcpIconSrc } from '@harness/agent-protocol';

import { assertAgentMcpHttpsUrl } from './mcp-url-security';

const MAX_ICON_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 86_400_000;

type CachedIcon = { body: Buffer; mimeType: string; expires: number };

@Injectable()
export class McpIconProxyService {
  private readonly cache = new Map<string, CachedIcon>();

  async resolve(src: string): Promise<{ body: Buffer; mimeType: string }> {
    const trimmed = src.trim();
    if (!trimmed || trimmed.length > 8192) {
      throw this.invalid('图标地址无效。');
    }
    if (!isAllowedMcpIconSrc(trimmed)) {
      throw this.invalid('不允许的图标地址。');
    }
    const cached = this.cache.get(trimmed);
    if (cached && cached.expires > Date.now()) {
      return { body: cached.body, mimeType: cached.mimeType };
    }
    const resolved = trimmed.startsWith('data:')
      ? decodeDataUri(trimmed)
      : await fetchHttpsIcon(trimmed);
    this.cache.set(trimmed, { ...resolved, expires: Date.now() + CACHE_TTL_MS });
    return resolved;
  }

  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}

function decodeDataUri(src: string): { body: Buffer; mimeType: string } {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,([a-z0-9+/=]+)$/i.exec(src);
  if (!match) throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: 'data URI 格式无效。' });
  const mimeType = match[1]!.toLowerCase().replace('jpg', 'jpeg');
  const body = Buffer.from(match[2]!, 'base64');
  if (!body.length || body.length > MAX_ICON_BYTES) {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: '图标体积过大。' });
  }
  assertImageMagic(body, mimeType);
  return { body, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType };
}

async function fetchHttpsIcon(src: string): Promise<{ body: Buffer; mimeType: string }> {
  assertAgentMcpHttpsUrl(src);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(src, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/x-icon,*/*' },
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.invalidSessionRequest,
        detail: `拉取图标失败（HTTP ${response.status}）。`,
      });
    }
    const finalUrl = response.url;
    if (finalUrl) assertAgentMcpHttpsUrl(finalUrl);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_ICON_BYTES) {
      throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: '图标体积过大。' });
    }
    const body = Buffer.from(arrayBuffer);
    const headerMime = ((response.headers.get('content-type') ?? '').split(';')[0] ?? '')
      .trim()
      .toLowerCase();
    const mimeType = normalizeMime(headerMime, body);
    assertImageMagic(body, mimeType);
    return { body, mimeType };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException({
      code: AGENT_ERROR_CODES.invalidSessionRequest,
      detail: '拉取图标失败。',
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMime(headerMime: string, body: Buffer): string {
  const header = headerMime.toLowerCase();
  if (header === 'image/png' || header === 'image/jpeg' || header === 'image/jpg') {
    return header === 'image/jpg' ? 'image/jpeg' : header;
  }
  if (header === 'image/webp') return 'image/webp';
  if (header === 'image/x-icon' || header === 'image/vnd.microsoft.icon') {
    return detectImageMimeFromBody(body);
  }
  return detectImageMimeFromBody(body);
}

function detectImageMimeFromBody(body: Buffer): string {
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50) return 'image/png';
  if (body.length >= 2 && body[0] === 0xff && body[1] === 0xd8) return 'image/jpeg';
  if (body.length >= 4 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) {
    return 'image/x-icon';
  }
  if (
    body.length >= 12 &&
    body.toString('ascii', 0, 4) === 'RIFF' &&
    body.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: '不支持的图标类型。' });
}

function assertImageMagic(body: Buffer, mimeType: string): void {
  if (mimeType === 'image/png') {
    if (body.length < 8 || body[0] !== 0x89 || body[1] !== 0x50) {
      throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: 'PNG 图标校验失败。' });
    }
    return;
  }
  if (mimeType === 'image/jpeg') {
    if (body.length < 2 || body[0] !== 0xff || body[1] !== 0xd8) {
      throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: 'JPEG 图标校验失败。' });
    }
    return;
  }
  if (mimeType === 'image/x-icon') {
    if (body.length < 4 || body[0] !== 0 || body[1] !== 0 || body[2] !== 1 || body[3] !== 0) {
      throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: 'ICO 图标校验失败。' });
    }
    return;
  }
  if (mimeType === 'image/webp') {
    if (
      body.length < 12 ||
      body.toString('ascii', 0, 4) !== 'RIFF' ||
      body.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail: 'WebP 图标校验失败。' });
    }
  }
}
