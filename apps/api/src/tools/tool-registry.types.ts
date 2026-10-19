import type { ToolPhase } from '../agent-runtime/tool-turn-budget';
import type { RunMcpSnapshot } from '../mcp/mcp.types';
import type { DeferredToolSearchIndex } from './tool-exposure/deferred-tool-search-index';

export type ToolRegistryContext = {
  userId: string;
  mcpSnapshot?: RunMcpSnapshot;
  toolPhase?: ToolPhase;
  activatedTools?: ReadonlySet<string>;
  deferredSearchIndex?: DeferredToolSearchIndex | null;
};
