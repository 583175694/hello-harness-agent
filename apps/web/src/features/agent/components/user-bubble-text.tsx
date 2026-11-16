import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { MessageResponse } from '../../../components/ai-elements/message';
import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';

/** 用户消息正文：超长时默认折叠，并提供展开全部。 */
export function UserBubbleText({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || expanded) return;
    setCollapsible(node.scrollHeight > AGENT_UI_BEHAVIOR.userMessageCollapsedMaxHeightPx);
  }, [body, expanded]);

  const collapsed = collapsible && !expanded;

  return (
    <div className="user-bubble__text-block">
      <div
        ref={contentRef}
        className={`user-bubble__text-body${collapsed ? ' user-bubble__text-body--collapsed' : ''}`}
        style={
          collapsed
            ? { maxHeight: AGENT_UI_BEHAVIOR.userMessageCollapsedMaxHeightPx }
            : undefined
        }
      >
        <MessageResponse variant="user" className="user-bubble__text">
          {body}
        </MessageResponse>
      </div>
      {collapsible ? (
        <button
          type="button"
          className="user-bubble__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="user-bubble__toggle-label">{expanded ? '收起' : '展开全部'}</span>
          <ChevronDown
            className={expanded ? 'is-open' : undefined}
            size={12}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}