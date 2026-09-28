import { GripVertical } from 'lucide-react';
import { Separator } from 'react-resizable-panels';
import type { ComponentProps } from 'react';

export {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  useDefaultLayout as useResizableDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

type ResizableHandleProps = ComponentProps<typeof Separator> & {
  withHandle?: boolean;
};

/** shadcn/ui 风格分隔条（基于 react-resizable-panels Separator） */
export function ResizableHandle({
  className = '',
  withHandle = true,
  ...props
}: ResizableHandleProps) {
  return (
    <Separator
      className={`ui-resize-handle ${withHandle ? 'ui-resize-handle--with-grip' : ''} ${className}`}
      aria-label="调整会话与工作台宽度"
      {...props}
    >
      {withHandle ? (
        <span className="ui-resize-handle__grip" aria-hidden="true">
          <GripVertical size={14} strokeWidth={2} />
        </span>
      ) : null}
    </Separator>
  );
}
