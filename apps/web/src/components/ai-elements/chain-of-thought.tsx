import { ChevronDown, Dot, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

const AUTO_COLLAPSE_DELAY_MS = 1000;

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

type ChainContextValue = {
  open: boolean;
  setOpen: (open: boolean, userInitiated?: boolean) => void;
};

export type ChainOfThoughtProps = HTMLAttributes<HTMLDivElement> & {
  running?: boolean;
  defaultOpen?: boolean;
  /** When true, collapses after final output or when `running` becomes false. */
  autoCollapse?: boolean;
  /** Signals that the final assistant reply is visible (streaming or complete). */
  finalOutputVisible?: boolean;
};

const ChainContext = createContext<ChainContextValue | null>(null);

function useChain(): ChainContextValue {
  const value = useContext(ChainContext);
  if (!value) throw new Error('ChainOfThought components must be nested inside ChainOfThought.');
  return value;
}

function resolveInitialOpen(
  defaultOpen: boolean | undefined,
  autoCollapse: boolean,
  running: boolean,
  finalOutputVisible: boolean,
): boolean {
  if (defaultOpen !== undefined) return defaultOpen;
  if (autoCollapse && (finalOutputVisible || !running)) return false;
  return true;
}

export function ChainOfThought({
  children,
  className,
  running = false,
  defaultOpen,
  autoCollapse = false,
  finalOutputVisible = false,
  ...props
}: ChainOfThoughtProps) {
  const [open, setOpenState] = useState(() =>
    resolveInitialOpen(defaultOpen, autoCollapse, running, finalOutputVisible),
  );
  const userExpandedRef = useRef(false);
  const sawActiveProcessRef = useRef(running && !finalOutputVisible);

  const setOpen = (next: boolean, userInitiated?: boolean) => {
    if (userInitiated) {
      userExpandedRef.current = next;
    }
    setOpenState(next);
  };

  useEffect(() => {
    if (running && !finalOutputVisible) {
      sawActiveProcessRef.current = true;
    }
  }, [running, finalOutputVisible]);

  useEffect(() => {
    if (!autoCollapse) return;
    const shouldCollapse = finalOutputVisible || !running;
    if (!shouldCollapse || userExpandedRef.current) return;
    if (!sawActiveProcessRef.current) {
      setOpenState(false);
      return;
    }
    const timer = window.setTimeout(() => setOpenState(false), AUTO_COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoCollapse, finalOutputVisible, running]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
    }),
    [open],
  );

  return (
    <ChainContext.Provider value={value}>
      <div className={classes('ai-chain', className)} aria-busy={running} {...props}>
        {children}
      </div>
    </ChainContext.Provider>
  );
}

export function ChainOfThoughtHeader({ children }: { children?: ReactNode }) {
  const { open, setOpen } = useChain();
  return (
    <button
      type="button"
      className="ai-chain__header"
      aria-expanded={open}
      onClick={() => setOpen(!open, true)}
    >
      <span>{children ?? '处理过程'}</span>
      <ChevronDown className={open ? 'is-open' : ''} size={16} aria-hidden="true" />
    </button>
  );
}

export function ChainOfThoughtContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChain();
  return (
    <div className={classes('ai-chain__content', open && 'is-open', className)} aria-hidden={!open}>
      <div className="ai-chain__content-inner" {...props} />
    </div>
  );
}

export type ChainStepStatus = 'complete' | 'active' | 'pending' | 'failed' | 'cancelled';

export function ChainOfThoughtStep({
  icon: Icon = Dot,
  label,
  description,
  status = 'complete',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  label?: ReactNode;
  description?: ReactNode;
  status?: ChainStepStatus;
}) {
  return (
    <div className={classes('ai-chain-step', `ai-chain-step--${status}`, className)} {...props}>
      <span className="ai-chain-step__rail" aria-hidden="true">
        <Icon size={15} />
      </span>
      <div className="ai-chain-step__body">
        {label != null && label !== '' ? (
          <div className="ai-chain-step__label">{label}</div>
        ) : null}
        {description ? <div className="ai-chain-step__description">{description}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function ChainOfThoughtSearchResults({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-chain-search-results', className)} {...props} />;
}

export function ChainOfThoughtSearchResult({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes('ai-chain-search-result', className)} {...props} />;
}
