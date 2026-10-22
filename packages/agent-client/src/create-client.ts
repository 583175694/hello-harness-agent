import { createArtifactsApi } from './artifacts.js';
import { createConfigApi } from './config.js';
import { createFilesApi } from './files.js';
import { createClientContext } from './http.js';
import { createMcpApi } from './mcp.js';
import { createMemoriesApi } from './memories.js';
import { createPendingInputsApi } from './pending-inputs.js';
import { createReadinessApi } from './readiness.js';
import { createRunsApi } from './runs.js';
import { createSessionsApi } from './sessions.js';
import { createSkillsApi } from './skills.js';
import { createSubscribeRun } from './sse.js';
import type { ApiClientConfig } from './types.js';

export function createAgentClient(config: ApiClientConfig) {
  const ctx = createClientContext(config);
  const subscribeRun = createSubscribeRun(ctx);
  return {
    ...createReadinessApi(ctx),
    ...createSessionsApi(ctx),
    ...createRunsApi(ctx),
    ...createFilesApi(ctx),
    ...createArtifactsApi(ctx),
    ...createPendingInputsApi(ctx),
    ...createConfigApi(ctx),
    ...createMcpApi(ctx),
    ...createMemoriesApi(ctx),
    ...createSkillsApi(ctx),
    subscribeRun,
  };
}

export type AgentClient = ReturnType<typeof createAgentClient>;
