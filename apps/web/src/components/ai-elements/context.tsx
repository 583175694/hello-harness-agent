import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Context({
  usedTokens,
  budgetTokens,
  compactionTriggered,
  children,
}: {
  usedTokens: number;
  budgetTokens: number;
  compactionTriggered?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const percentage = budgetTokens > 0 ? Math.min(100, (usedTokens / budgetTokens) * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="ai-context" ref={rootRef}>
      <button
        type="button"
        className="ai-context__trigger"
        aria-label={`上下文已使用 ${percentage.toFixed(0)}%`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{percentage.toFixed(0)}%</span>
        <svg viewBox="0 0 24 24" width="18" height="18" role="img" aria-hidden="true">
          <circle cx="12" cy="12" r="9" pathLength="100" />
          <circle
            className="ai-context__value"
            cx="12"
            cy="12"
            r="9"
            pathLength="100"
            style={{ strokeDashoffset: 100 - percentage }}
          />
        </svg>
      </button>
      {open ? (
        <div className="ai-context__content" role="status">
          <div className="ai-context__heading">
            <strong>上下文使用量</strong>
            <span>{percentage.toFixed(1)}%</span>
          </div>
          <div className="ai-context__progress">
            <span style={{ width: `${percentage}%` }} />
          </div>
          <dl>
            <div>
              <dt>已使用</dt>
              <dd>{usedTokens.toLocaleString()} tokens</dd>
            </div>
            <div>
              <dt>输入预算</dt>
              <dd>{budgetTokens.toLocaleString()} tokens</dd>
            </div>
            <div>
              <dt>剩余预算</dt>
              <dd>{Math.max(0, budgetTokens - usedTokens).toLocaleString()} tokens</dd>
            </div>
          </dl>
          {compactionTriggered ? <p>本轮已执行上下文压缩</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
