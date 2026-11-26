import { memo, useEffect, useState, type ReactNode } from 'react';
import { MarkdownContent } from '../../../components/markdown-content';
import { AGENT_UI_COPY } from '../config/ui.constants';

export const NORMALIZED_DOCUMENT_FILE_KINDS = new Set(['docx', 'pdf', 'xlsx', 'pptx']);

const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const HTML_FILE_EXTENSIONS = new Set(['html', 'htm']);

export function isHtmlFilePreview(
  fileKind?: string,
  mediaType?: string | null,
  fileName?: string,
): boolean {
  if (fileKind === 'html') return true;
  if (mediaType?.toLowerCase().split(';')[0]?.trim() === 'text/html') return true;
  if (!fileName) return false;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return false;
  return HTML_FILE_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase());
}

export function isArtifactImagePreview(
  fileKind: string,
  mediaType?: string | null,
  fileName?: string,
): boolean {
  if (fileKind === 'image') return true;
  if (mediaType?.startsWith('image/') && fileKind !== 'html') return true;
  if (!fileName) return false;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_FILE_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase());
}

export function isNormalizedDocumentPreview(fileKind: string, fileName: string): boolean {
  if (NORMALIZED_DOCUMENT_FILE_KINDS.has(fileKind)) return true;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return false;
  return NORMALIZED_DOCUMENT_FILE_KINDS.has(fileName.slice(dot + 1).toLowerCase());
}

type DeliverableMarkdownPanelProps = {
  content: string;
  /** docx / pdf / xlsx：展示与下载文件版式可能不一致的说明 */
  showFormatNotice: boolean;
  className?: string;
};

/** Workbench / 附件弹框共用的交付物 Markdown 预览壳层。 */
export function DeliverableMarkdownPanel({
  content,
  showFormatNotice,
  className,
}: DeliverableMarkdownPanelProps) {
  const panelClassName = [
    'deliverables-preview-panel',
    'deliverables-preview-panel--markdown',
    showFormatNotice ? 'deliverables-preview-panel--document' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (showFormatNotice) {
    return (
      <div className={panelClassName}>
        <aside className="deliverable-preview-format-notice" role="note">
          {AGENT_UI_COPY.deliverableBinaryFormatPreviewNotice}
        </aside>
        <div className="deliverable-preview-markdown-body">
          <MarkdownContent variant="report">{content}</MarkdownContent>
        </div>
      </div>
    );
  }

  return (
    <div className={panelClassName}>
      <MarkdownContent variant="report">{content}</MarkdownContent>
    </div>
  );
}

export function DeliverablePreviewSkeleton({ overlay }: { overlay?: boolean }) {
  return (
    <div
      className={`deliverables-preview-panel deliverables-preview-panel--skeleton ${overlay ? 'deliverables-preview-panel--skeleton-overlay' : ''}`}
      aria-busy="true"
      aria-label="正在加载预览"
    >
      <div className="deliverable-preview-skeleton">
        <div className="deliverable-preview-skeleton__heading" />
        <div className="deliverable-preview-skeleton__subheading" />
        <div className="deliverable-preview-skeleton__paragraph">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--short" />
        </div>
        <div className="deliverable-preview-skeleton__heading deliverable-preview-skeleton__heading--section" />
        <div className="deliverable-preview-skeleton__paragraph">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--medium" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--short" />
        </div>
        <div className="deliverable-preview-skeleton__paragraph deliverable-preview-skeleton__paragraph--fade">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--medium" />
        </div>
      </div>
    </div>
  );
}

type HtmlPreviewPanelProps = {
  previewKey: string;
  fileName: string;
  previewUrl: string;
  errorHint?: string;
  errorActions?: ReactNode;
  className?: string;
};

/** Workbench / 附件弹框共用的 HTML iframe 预览壳层。 */
export const HtmlPreviewPanel = memo(
  function HtmlPreviewPanel({
    previewKey,
    fileName,
    previewUrl,
    errorHint,
    errorActions,
    className,
  }: HtmlPreviewPanelProps) {
    const [frameState, setFrameState] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
      setFrameState('loading');
    }, [previewKey, previewUrl]);

    const panelClassName = ['deliverables-preview-panel', 'deliverables-preview-panel--iframe', className]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={panelClassName}>
        {frameState === 'loading' ? <DeliverablePreviewSkeleton overlay /> : null}
        {frameState === 'error' ? (
          <div className="deliverables-preview-panel deliverables-preview-panel--error" role="alert">
            <strong>网页预览加载失败</strong>
            <span>{errorHint ?? `请使用「在新窗口打开」查看 ${fileName}。`}</span>
            {errorActions}
          </div>
        ) : null}
        <iframe
          key={previewKey}
          className={`deliverables-preview-frame ${frameState === 'ready' ? 'is-ready' : ''}`}
          title={`预览 ${fileName}`}
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin allow-popups"
          onLoad={() => setFrameState('ready')}
          onError={() => setFrameState('error')}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.previewUrl === next.previewUrl &&
    prev.previewKey === next.previewKey &&
    prev.fileName === next.fileName &&
    prev.errorHint === next.errorHint &&
    prev.className === next.className,
);
