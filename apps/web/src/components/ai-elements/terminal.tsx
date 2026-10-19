import Ansi from 'ansi-to-react';
import { copyTextToClipboard } from '../../lib/clipboard';
import { Check, Copy, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

type TerminalContextValue = {
  output: string;
  isStreaming: boolean;
  autoScroll: boolean;
  onClear?: () => void;
};

const TerminalContext = createContext<TerminalContextValue>({
  autoScroll: true,
  isStreaming: false,
  output: '',
});

export function Terminal({
  output,
  isStreaming = false,
  autoScroll = true,
  onClear,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  output: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
}) {
  const contextValue = useMemo(
    () => ({ autoScroll, isStreaming, onClear, output }),
    [autoScroll, isStreaming, onClear, output],
  );

  return (
    <TerminalContext.Provider value={contextValue}>
      <div className={classes('ai-terminal', className)} {...props}>
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
              <div className="ai-terminal__header-end">
                <TerminalStatus />
                <TerminalActions>
                  <TerminalCopyButton />
                  <TerminalClearButton />
                </TerminalActions>
              </div>
            </TerminalHeader>
            <TerminalContent />
          </>
        )}
      </div>
    </TerminalContext.Provider>
  );
}

export function TerminalHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('ai-terminal__header', className)} {...props}>
      {children}
    </div>
  );
}

export function TerminalTitle({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('ai-terminal__title', className)} {...props}>
      <TerminalIcon size={14} aria-hidden="true" />
      {children ?? 'Terminal'}
    </div>
  );
}

export function TerminalStatus({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { isStreaming } = useContext(TerminalContext);
  if (!isStreaming) return null;
  return (
    <div className={classes('ai-terminal__status', className)} {...props}>
      {children ?? 'Running…'}
    </div>
  );
}

export function TerminalActions({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('ai-terminal__actions', className)} {...props}>
      {children}
    </div>
  );
}

export function TerminalCopyButton({
  onCopy,
  onError,
  timeout = 2_000,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef(0);
  const { output } = useContext(TerminalContext);

  const copyToClipboard = useCallback(async () => {
    try {
      await copyTextToClipboard(output);
      setIsCopied(true);
      onCopy?.();
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [output, onCopy, onError, timeout]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? Check : Copy;

  return (
    <button
      type="button"
      className={classes('ai-terminal__icon-button', className)}
      aria-label={isCopied ? '已复制' : '复制输出'}
      onClick={() => void copyToClipboard()}
      {...props}
    >
      {children ?? <Icon size={14} aria-hidden="true" />}
    </button>
  );
}

export function TerminalClearButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onClear } = useContext(TerminalContext);
  if (!onClear) return null;
  return (
    <button
      type="button"
      className={classes('ai-terminal__icon-button', className)}
      aria-label="清除输出"
      onClick={onClear}
      {...props}
    >
      {children ?? <Trash2 size={14} aria-hidden="true" />}
    </button>
  );
}

export function TerminalContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  const { output, isStreaming, autoScroll } = useContext(TerminalContext);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  return (
    <div className={classes('ai-terminal__content', className)} ref={containerRef} {...props}>
      {children ?? (
        <pre className="ai-terminal__output">
          <Ansi className="ai-terminal__ansi">{output}</Ansi>
          {isStreaming ? <span className="ai-terminal__cursor" aria-hidden="true" /> : null}
        </pre>
      )}
    </div>
  );
}
