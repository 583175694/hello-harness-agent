import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, Dot } from 'lucide-react';
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { MarkdownContent } from '../markdown-content';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration?: number;
};
const ReasoningContext = createContext<ReasoningContextValue | null>(null);
export function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) throw new Error('Reasoning components must be used within Reasoning');
  return context;
}
const AUTO_CLOSE_DELAY = 1000;
export type ReasoningProps = ComponentProps<typeof Collapsible.Root> & {
  isStreaming?: boolean;
  duration?: number;
};
export const Reasoning = memo(function Reasoning({
  className,
  isStreaming = false,
  duration: durationProp,
  defaultOpen,
  open,
  onOpenChange,
  children,
  ...props
}: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(open ?? defaultOpen ?? isStreaming);
  const [duration, setDuration] = useState(durationProp);
  const startRef = useRef<number | null>(isStreaming ? Date.now() : null);
  useEffect(() => {
    if (isStreaming) {
      startRef.current ??= Date.now();
      setIsOpen(true);
    } else if (startRef.current !== null) {
      setDuration(durationProp ?? Math.ceil((Date.now() - startRef.current) / 1000));
      startRef.current = null;
      const timer = window.setTimeout(() => setIsOpen(false), AUTO_CLOSE_DELAY);
      return () => window.clearTimeout(timer);
    }
  }, [isStreaming, durationProp]);
  useEffect(() => {
    if (open !== undefined) setIsOpen(open);
  }, [open]);
  const value = useMemo(
    () => ({ isStreaming, isOpen, setIsOpen, duration }),
    [isStreaming, isOpen, duration],
  );
  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible.Root
        className={className}
        open={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          onOpenChange?.(next);
        }}
        {...props}
      >
        {children}
      </Collapsible.Root>
    </ReasoningContext.Provider>
  );
});
export type ReasoningTriggerProps = ComponentProps<typeof Collapsible.Trigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};
export const ReasoningTrigger = memo(function ReasoningTrigger({
  className,
  children,
  getThinkingMessage,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();
  const label =
    getThinkingMessage?.(isStreaming, duration) ??
    (isStreaming
      ? 'Thinking...'
      : duration === undefined
        ? 'Thought'
        : `Thought for ${duration} seconds`);
  return (
    <Collapsible.Trigger
      className={`ai-reasoning__trigger${className ? ` ${className}` : ''}`}
      {...props}
    >
      <Dot size={15} aria-hidden="true" />
      <span className={isStreaming ? 'ai-shimmer' : undefined}>{children ?? label}</span>
      <ChevronDown className={isOpen ? 'is-open' : ''} size={15} aria-hidden="true" />
    </Collapsible.Trigger>
  );
});
export const ReasoningContent = memo(function ReasoningContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Collapsible.Content> & { children: string }) {
  return (
    <Collapsible.Content
      className={`ai-reasoning__content${className ? ` ${className}` : ''}`}
      {...props}
    >
      <MarkdownContent>{children}</MarkdownContent>
    </Collapsible.Content>
  );
});
