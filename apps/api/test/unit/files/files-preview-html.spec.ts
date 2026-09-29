import { describe, expect, it, vi } from 'vitest';
import {
  ARTIFACT_HTML_PREVIEW_CSP,
  ARTIFACT_HTML_PREVIEW_REFERRER_POLICY,
} from '../../../src/files/artifact-html-preview.constants';
import { FilesService } from '../../../src/files/files.service';

function makeService() {
  const prisma = {
    session: { findFirst: vi.fn() },
    file: { findFirst: vi.fn() },
  };
  const storage = { readObject: vi.fn(), createReadUrl: vi.fn() };
  const processor = { parse: vi.fn() };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    service: new FilesService(
      prisma as never,
      processor as never,
      storage as never,
      logger as never,
    ),
    prisma,
    storage,
  };
}

describe('FilesService HTML preview (C5-B)', () => {
  it('reads original bytes for agent-generated html', async () => {
    const { service, prisma, storage } = makeService();
    const html = Buffer.from('<!doctype html><html><body><h1>Hi</h1></body></html>', 'utf8');
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-1',
      sessionId: 'session-1',
      userId: 'local-user',
      status: 'ready',
      fileKind: 'html',
      origin: 'agent_generated',
      originalKey: 'sessions/session-1/files/file-1/original',
      normalizedKey: 'sessions/session-1/files/file-1/normalized',
      previewKey: null,
      fileName: 'page.html',
    });
    storage.readObject.mockResolvedValue({ content: html });

    const result = await service.preview('local-user', 'file-1');

    expect(storage.readObject).toHaveBeenCalledWith({
      sessionId: 'session-1',
      fileId: 'file-1',
      variant: 'original',
    });
    expect(result).toMatchObject({
      fileId: 'file-1',
      content: html,
      contentType: 'text/html; charset=utf-8',
      htmlPreview: true,
      fileName: 'page.html',
    });
  });

  it('falls back to normalized text for non-generated html', async () => {
    const { service, prisma, storage } = makeService();
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-2',
      sessionId: 'session-1',
      userId: 'local-user',
      status: 'ready',
      fileKind: 'html',
      origin: 'user_upload',
      originalKey: 'sessions/session-1/files/file-2/original',
      normalizedKey: 'sessions/session-1/files/file-2/normalized',
      previewKey: null,
      fileName: 'upload.html',
    });
    storage.readObject.mockResolvedValue({ content: Buffer.from('# Title', 'utf8') });

    const result = await service.preview('local-user', 'file-2');

    expect(storage.readObject).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'normalized' }),
    );
    expect(result).toMatchObject({
      content: '# Title',
      contentType: 'text/plain',
    });
    expect(result).not.toHaveProperty('htmlPreview');
  });
});

describe('artifact HTML preview constants', () => {
  it('freezes CSP baseline for integration assertions', () => {
    expect(ARTIFACT_HTML_PREVIEW_CSP).toContain("default-src 'none'");
    expect(ARTIFACT_HTML_PREVIEW_CSP).toContain("script-src 'unsafe-inline'");
    expect(ARTIFACT_HTML_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(ARTIFACT_HTML_PREVIEW_CSP).toContain("frame-ancestors 'self'");
    expect(ARTIFACT_HTML_PREVIEW_REFERRER_POLICY).toBe('no-referrer');
  });
});
