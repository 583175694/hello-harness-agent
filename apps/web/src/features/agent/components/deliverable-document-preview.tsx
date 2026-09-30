import { MarkdownContent } from '../../../components/markdown-content';
import { AGENT_UI_COPY } from '../config/ui.constants';

export const NORMALIZED_DOCUMENT_FILE_KINDS = new Set(['docx', 'pdf', 'xlsx', 'pptx']);

const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);

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
