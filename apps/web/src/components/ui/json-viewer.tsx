import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';

const JSON_TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;

function highlightedJson(json: string): ReactNode[] {
  const output: ReactNode[] = [];
  let cursor = 0;

  for (const match of json.matchAll(JSON_TOKEN_PATTERN)) {
    const index = match.index;
    const token = match[0];
    if (index > cursor) output.push(json.slice(cursor, index));
    const trailing = json.slice(index + token.length);
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

  if (cursor < json.length) output.push(json.slice(cursor));
  return output;
}

export function JsonViewer({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(json);
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
      <pre tabIndex={0}>
        <code>{highlightedJson(json)}</code>
      </pre>
    </div>
  );
}
