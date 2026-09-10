import { Brain, ChevronDown, Dot, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

type ChainContextValue = {
  open: boolean;
  setOpen: (open: boolean, userInitiated?: boolean) => void;
};

const ChainContext = createContext<ChainContextValue | null>(null);

function useChain(): ChainContextValue {
  const value = useContext(ChainContext);
  if (!value) throw new Error('ChainOfThought components must be nested inside ChainOfThought.');
  return value;
}

export function ChainOfThought({
  children,
  className,
  running = false,
  defaultOpen,
  ...props
}: HTMLAttributes<HTMLDivElement> & { running?: boolean; defaultOpen?: boolean }) {
  const [open, setOpenState] = useState(defaultOpen ?? true);

  const value = useMemo(
    () => ({
      open,
      setOpen: (next: boolean) => setOpenState(next),
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
      <Brain size={16} aria-hidden="true" />
      <span>{children ?? '处理过程'}</span>
      <ChevronDown className={open ? 'is-open' : ''} size={16} aria-hidden="true" />
    </button>
  );
}

export function ChainOfThoughtContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChain();
  if (!open) return null;
  return <div className={classes('ai-chain__content', className)} {...props} />;
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
  label: ReactNode;
  description?: ReactNode;
  status?: ChainStepStatus;
}) {
  return (
    <div className={classes('ai-chain-step', `ai-chain-step--${status}`, className)} {...props}>
      <span className="ai-chain-step__rail" aria-hidden="true">
        <Icon size={15} />
      </span>
      <div className="ai-chain-step__body">
        <div className="ai-chain-step__label">{label}</div>
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
