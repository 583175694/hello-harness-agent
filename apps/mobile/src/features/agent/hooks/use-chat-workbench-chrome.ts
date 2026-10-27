import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { WorkbenchState } from '@harness/agent-ui-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeWorkbenchView, resolveMobileWorkbenchVisibleTabs } from '../config/workbench-tabs';
import { AGENT_UI_LAYOUT } from '../config/ui.constants';
import type {
  WorkbenchActivityEmphasis,
  WorkbenchOpenRequest,
} from '../components/workbench-activity-view';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { mobileWorkbenchViewFromFocus } from '../model/workbench-focus';

export type ChatWorkbenchChromeInput = {
  isSplitLayout: boolean;
  workbenchCount: number;
  hasDeliverables: boolean;
  /** Run / fixture 推导的默认 emphasis（无显式 open 请求时） */
  baselineActivityEmphasis?: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  /** 切换会话时重置 open 请求 */
  sessionKey?: string | null;
  /** HITL 等场景下忽略 workbench.focusTarget 自动跳转 */
  suppressFocusTarget?: boolean;
  /** Preview：初始 Tab / Sheet */
  initialView?: WorkspaceView;
  initialSheetIndex?: number;
  autoPresentOnMount?: boolean;
};

function normalizeOpenRequest(
  request: WorkbenchOpenRequest | WorkspaceView = 'activity',
): WorkbenchOpenRequest {
  return typeof request === 'string' ? { view: request } : request;
}

export function useChatWorkbenchChrome({
  isSplitLayout,
  workbenchCount,
  hasDeliverables,
  baselineActivityEmphasis = 'default',
  workbench,
  sessionKey = null,
  suppressFocusTarget = false,
  initialView,
  initialSheetIndex,
  autoPresentOnMount = false,
}: ChatWorkbenchChromeInput) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const visibleWorkbenchTabs = useMemo(
    () => resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables }),
    [workbenchCount, hasDeliverables],
  );

  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(() =>
    normalizeWorkbenchView(initialView ?? 'activity', visibleWorkbenchTabs),
  );
  const [splitPaneOpen, setSplitPaneOpen] = useState(isSplitLayout);
  const [openRequest, setOpenRequest] = useState<WorkbenchOpenRequest>({});

  const [runtimeToolCallId, setRuntimeToolCallId] = useState<string | null>(null);
  const [runtimeArtifactId, setRuntimeArtifactId] = useState<string | null>(null);

  useEffect(() => {
    setOpenRequest({});
    setRuntimeToolCallId(null);
    setRuntimeArtifactId(null);
  }, [sessionKey]);

  useEffect(() => {
    if (suppressFocusTarget) return;
    const target = workbench?.focusTarget;
    if (!target) return;
    setWorkbenchView(
      normalizeWorkbenchView(mobileWorkbenchViewFromFocus(target.kind), visibleWorkbenchTabs),
    );
    if (target.kind === 'tool_call') {
      setRuntimeToolCallId(target.toolCallId);
    }
    if (target.kind === 'artifact') {
      setRuntimeArtifactId(target.artifactId);
    }
  }, [suppressFocusTarget, workbench?.focusTarget, visibleWorkbenchTabs]);

  const activityEmphasis = openRequest.emphasis ?? baselineActivityEmphasis;
  const selectedToolCallId = openRequest.toolCallId ?? runtimeToolCallId;
  const focusArtifactId = openRequest.artifactId ?? runtimeArtifactId;

  const presentSheet = useCallback(
    (snapIndex: number = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex) => {
      if (isSplitLayout) {
        setSplitPaneOpen(true);
        return;
      }
      const sheet = sheetRef.current;
      if (!sheet) return;
      sheet.present();
      requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(snapIndex);
      });
    },
    [isSplitLayout],
  );

  const openWorkbench = useCallback(
    (
      request: WorkbenchOpenRequest | WorkspaceView = 'activity',
      snapIndex: number = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex,
    ) => {
      const normalized = normalizeOpenRequest(request);
      const view = normalizeWorkbenchView(normalized.view ?? 'activity', visibleWorkbenchTabs);
      setWorkbenchView(view);
      setOpenRequest((prev) => ({
        ...prev,
        ...normalized,
        view,
      }));
      if (normalized.toolCallId !== undefined) {
        setRuntimeToolCallId(normalized.toolCallId);
      }
      if (normalized.artifactId !== undefined) {
        setRuntimeArtifactId(normalized.artifactId);
      }
      presentSheet(snapIndex);
    },
    [presentSheet, visibleWorkbenchTabs],
  );

  const closeWorkbench = useCallback(() => {
    if (isSplitLayout) {
      setSplitPaneOpen(true);
      return;
    }
    sheetRef.current?.dismiss();
  }, [isSplitLayout]);

  const setSelectedToolCallId = useCallback((toolCallId: string | null) => {
    setRuntimeToolCallId(toolCallId);
    setOpenRequest((prev) => ({ ...prev, toolCallId: toolCallId ?? undefined }));
  }, []);

  useEffect(() => {
    if (!autoPresentOnMount || initialSheetIndex === undefined || initialSheetIndex < 0) {
      return;
    }
    const view = normalizeWorkbenchView(initialView ?? 'activity', visibleWorkbenchTabs);
    setWorkbenchView(view);
    presentSheet(initialSheetIndex);
  }, [
    autoPresentOnMount,
    initialSheetIndex,
    initialView,
    presentSheet,
    visibleWorkbenchTabs,
  ]);

  return {
    sheetRef,
    visibleWorkbenchTabs,
    workbenchView,
    setWorkbenchView,
    splitPaneOpen,
    openWorkbench,
    closeWorkbench,
    activityEmphasis,
    selectedToolCallId,
    focusArtifactId,
    setSelectedToolCallId,
  };
}
