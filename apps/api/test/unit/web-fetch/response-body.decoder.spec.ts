import { describe, expect, it } from 'vitest';
import { decodeResponseBody } from '../../../src/web-fetch/response-body.decoder';

describe('decodeResponseBody', () => {
  it('defaults to utf-8 without meta', () => {
    const body = Buffer.from('公开网页正文', 'utf8');
    expect(decodeResponseBody(body, 'text/plain', 'utf-8')).toBe('公开网页正文');
  });

  it('honors utf-8 meta when header charset is missing', () => {
    const body = Buffer.from(
      '<html><head><meta charset="utf-8"></head><body>生成式 AI</body></html>',
      'utf8',
    );
    expect(decodeResponseBody(body, 'text/html')).toContain('生成式 AI');
  });
});