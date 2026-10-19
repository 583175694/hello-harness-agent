import type { Response } from 'express';

/**
 * C5-B CSP for agent-generated HTML artifact preview (docs/37-c5 §15.4).
 * Allows **inline** scripts so scroll/reveal landing pages match download; external
 * script URLs remain blocked (`default-src 'none'`); `connect-src 'none'` blocks fetch/XHR.
 */
export const ARTIFACT_HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** Workbench iframe sandbox tokens aligned with {@link ARTIFACT_HTML_PREVIEW_CSP}. */
export const ARTIFACT_HTML_PREVIEW_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups';

export const ARTIFACT_HTML_PREVIEW_REFERRER_POLICY = 'no-referrer';

export function applyArtifactHtmlPreviewHeaders(response: Response, fileName?: string): void {
  response.setHeader('Content-Security-Policy', ARTIFACT_HTML_PREVIEW_CSP);
  response.setHeader('Referrer-Policy', ARTIFACT_HTML_PREVIEW_REFERRER_POLICY);
  response.setHeader('Cache-Control', 'private, no-store');
  if (fileName) {
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  } else {
    response.setHeader('Content-Disposition', 'inline');
  }
}
