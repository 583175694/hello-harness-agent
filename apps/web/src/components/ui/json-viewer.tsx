import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Copy } from 'lucide-react';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { copyTextToClipboard } from '../../lib/clipboard';

const JSON_TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\\d+)?|\b(?:true|false|null)\b/g;

const JSON_LINE_ESTIMATE_PX = 18;

function highlightedJsonLine(line: string): ReactNode[] {
  const output: ReactNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
    const index = match.index;
    const token = match[0];
    if (index === undefined) continue;
    if (index > cursor) output.push(line.slice(cursor, index));
    const trailing = line.slice(index + token.length);
    const kind =
      token.startsWith('"') && /^\s*:/u.test(trailing)
        ? 'key'
        : token.startsWith('"')
          ? 'string'
          : token === 'true' || token === 'false'
            ? 'boolean'
            : token === 'null'
              ? 'null'
              : 'number';
    output.push(
      <span className={`json-token json-token--${kind}`} key={`${index}-${kind}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }

  if (cursor < line.length) output.push(line.slice(cursor));
  if (!output.length) output.push('\u00a0');
  return output;
}

const JsonLine = memo(function JsonLine({ line }: { line: string }) {
  const content = useMemo(() => highlightedJsonLine(line), [line]);
  return <code className="json-viewer__line">{content}</code>;
});

export function JsonViewer({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const lines = useMemo(() => json.split('\n'), [json]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => JSON_LINE_ESTIMATE_PX,
    overscan: 16,
    getItemKey: (index) => index,
  });

  async function copy(): Promise<void> {
    await copyTextToClipboard(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div className="json-viewer">
      <div className="json-viewer__toolbar">
        <span>JSON</span>
        <button
          className="icon-button icon-button--small"
          type="button"
          aria-label="复制 Context JSON"
          title="复制 Context JSON"
          onClick={() => void copy()}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div ref={scrollRef} className="json-viewer__viewport" tabIndex={0} role="region" aria-label="Context JSON">
        <div
          className="json-viewer__virtual-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="json-viewer__virtual-row"
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <JsonLine line={lines[virtualRow.index] ?? ''} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
