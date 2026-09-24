import type { ReactNode } from 'react';

import type {
  AgentUiState as BaseAgentUiState,
  WorkbenchState as BaseWorkbenchState,
} from '@harness/agent-ui-types';

export type {
  ConversationItem,
  PreviewState,
  ServiceState,
  SourceView,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkspaceView,
  ActivityStatus,
  ToolCallStatus,
} from '@harness/agent-ui-types';

/** Web Report tab 支持 Markdown 字符串或预渲染 React 节点。 */
export type ReportView = {
  title: string;
  updated: string;
  markdown?: string;
  content?: ReactNode;
};

export type WorkbenchState = Omit<BaseWorkbenchState, 'report'> & { report?: ReportView };

export type AgentUiState = Omit<BaseAgentUiState, 'workbench'> & { workbench?: WorkbenchState };
