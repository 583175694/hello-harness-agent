import { createAgentClient } from '@harness/agent-client';

export type {
  ToolStreamEvent,
  MessageDeltaEvent,
  MessagePhaseCompletedEvent,
  MessageDiscardedEvent,
  ReasoningDeltaEvent,
  ModelRoundCompletedEvent,
  AgentClient,
} from '@harness/agent-client';

export { ApiProblem, createAgentClient } from '@harness/agent-client';

const client = createAgentClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  // Delegate to global fetch so vitest can stub fetch after module load.
  fetch: (input, init) => fetch(input, init),
});

export const getReadiness = client.getReadiness.bind(client);
export const createSession = client.createSession.bind(client);
export const listSessions = client.listSessions.bind(client);
export const getSession = client.getSession.bind(client);
export const deleteSession = client.deleteSession.bind(client);
export const updateSession = client.updateSession.bind(client);
export const generateSessionTitle = client.generateSessionTitle.bind(client);
export const createRun = client.createRun.bind(client);
export const getArtifactSeries = client.getArtifactSeries.bind(client);
export const restoreArtifact = client.restoreArtifact.bind(client);
export const uploadFile = client.uploadFile.bind(client);
export const getFile = client.getFile.bind(client);
export const getFilePreview = client.getFilePreview.bind(client);
export const retryFile = client.retryFile.bind(client);
export const deleteFile = client.deleteFile.bind(client);
export const getArtifact = client.getArtifact.bind(client);
export const getReport = client.getReport.bind(client);
export const deleteReport = client.deleteReport.bind(client);
export const getArtifactPreview = client.getArtifactPreview.bind(client);
export const getArtifactPreviewUrl = client.getArtifactPreviewUrl.bind(client);
export const getArtifactDownloadUrl = client.getArtifactDownloadUrl.bind(client);
export const downloadArtifact = client.downloadArtifact.bind(client);
export const deleteArtifact = client.deleteArtifact.bind(client);
export const submitPendingInput = client.submitPendingInput.bind(client);
export const promotePendingInput = client.promotePendingInput.bind(client);
export const cancelPendingInput = client.cancelPendingInput.bind(client);
export const resumePendingQueue = client.resumePendingQueue.bind(client);
export const sendPendingInput = client.sendPendingInput.bind(client);
export const getPublicAgentConfig = client.getPublicAgentConfig.bind(client);
export const getRun = client.getRun.bind(client);
export const cancelRun = client.cancelRun.bind(client);
export const controlRun = client.controlRun.bind(client);
export const subscribeRun = client.subscribeRun.bind(client);
export const listMcpServers = client.listMcpServers.bind(client);
export const createMcpServer = client.createMcpServer.bind(client);
export const updateMcpServer = client.updateMcpServer.bind(client);
export const patchMcpServer = client.patchMcpServer.bind(client);
export const deleteMcpServer = client.deleteMcpServer.bind(client);
export const testMcpServer = client.testMcpServer.bind(client);
