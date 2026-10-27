import type { AgentUiState } from '@harness/agent-ui-types';
import type { PendingUserInputView } from '@harness/agent-protocol';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { SessionComposerBlock } from '../lib/session-composer-block';

/** Run 宿主共享的可变会话存储（refs + 轻量 setState 触发 UI sync）。 */
export type RunHostSessionStore = {
  sessionStatesRef: MutableRefObject<Record<string, AgentUiState>>;
  runSequencesRef: MutableRefObject<Record<string, number>>;
  runControllersRef: MutableRefObject<Record<string, AbortController>>;
  pendingInputsRef: MutableRefObject<PendingUserInputView[]>;
  pendingSessionsRef: MutableRefObject<Record<string, boolean>>;
  selectedSessionIdRef: MutableRefObject<string | null>;
  setSessionPending: (sessionId: string, pending: boolean) => void;
  setSessionState: (sessionId: string, next: AgentUiState) => void;
  composerBlocks: Record<string, SessionComposerBlock>;
  setComposerBlocks: Dispatch<SetStateAction<Record<string, SessionComposerBlock>>>;
};
