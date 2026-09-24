import {
  cancelRunResponseSchema,
  runControlResponseSchema,
  createRunResponseSchema,
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  generateSessionTitleResponseSchema,
  listSessionsResponseSchema,
  problemDetailsSchema,
  runSnapshotSchema,
  runStreamEventSchema,
  serviceStatusSchema,
  sessionDetailResponseSchema,
  updateSessionResponseSchema,
  fileRefSchema,
  artifactRefSchema,
  reportRefSchema,
  artifactSeriesRefSchema,
  restoreArtifactResultSchema,
  mcpServerListResponseSchema,
  mcpServerViewSchema,
  mcpServerTestResponseSchema,
  mcpCreateServerRequestSchema,
} from '@harness/agent-protocol';
import type {
  CancelRunResponse,
  CreateRunResponse,
  DeleteSessionResponse,
  GenerateSessionTitleResponse,
  ProblemDetails,
  ServiceStatus,
  SessionDetailResponse,
  SessionSummary,
  RunSnapshot,
  RunControlCommand,
  RunStreamEvent,
  RunControlResponse,
  UpdateSessionRequest,
  ReasoningEffort,
  PublicAgentConfig,
  FileRef,
  ArtifactRef,
  ReportRef,
  ArtifactSeriesRef,
  RestoreArtifactResult,
  McpCreateServerRequest,
  McpUpdateServerRequest,
  McpPatchServerRequest,
  McpServerView,
  McpServerListResponse,
  McpServerTestResponse,
} from '@harness/agent-protocol';
import { publicAgentConfigSchema } from '@harness/agent-protocol';

type RunPayload = RunStreamEvent['payload'];
// 从统一 Run Event payload 中提取前端 Reducer 直接消费的工具生命周期事件。
export type ToolStreamEvent = Extract<
  RunPayload,
  { type: 'tool.started' | 'tool.completed' | 'tool.failed' | 'tool.cancelled' }
>;
// 文本增量单独导出，保证 Conversation Block 更新时保留稳定的 Round/Block 位置信息。
export type MessageDeltaEvent = Extract<RunPayload, { type: 'message.delta' }>;
export type MessagePhaseCompletedEvent = Extract<RunPayload, { type: 'message.phase.completed' }>;
export type MessageDiscardedEvent = Extract<RunPayload, { type: 'message.discarded' }>;
export type ReasoningDeltaEvent = Extract<RunPayload, { type: 'reasoning.delta' }>;
export type ModelRoundCompletedEvent = Extract<RunPayload, { type: 'model.round.completed' }>;


export type AgentClientConfig = { baseUrl: string; fetch?: typeof fetch };
export type AgentClient = ReturnType<typeof createAgentClient>;

export class ApiProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiProblem';
  }
}

export function createAgentClient(config: AgentClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const fetchFn = config.fetch ?? fetch;

  async function parseResponse(response: Response): Promise<unknown> {
    const data: unknown = await response.json();
    if (!response.ok) throw new ApiProblem(problemDetailsSchema.parse(data));
    return data;
  }

  // 读取 API 就绪状态，再启用生产 Composer 操作。
  async function getReadiness(signal?: AbortSignal): Promise<ServiceStatus> {
    const response = await fetchFn(`${baseUrl}/readyz`, { signal });
    const data: unknown = await response.json();

    if (!response.ok) {
      throw new ApiProblem(problemDetailsSchema.parse(data));
    }

    return serviceStatusSchema.parse(data);
  }

  // 创建首次发送时才需要的持久化会话。
  async function createSession(title: string): Promise<SessionSummary> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return createSessionResponseSchema.parse(await parseResponse(response)).session;
  }

  // 读取当前本地用户按更新时间排序的会话列表。
  async function listSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions`, { signal });
    return listSessionsResponseSchema.parse(await parseResponse(response)).sessions;
  }

  // 读取一个会话及其持久化消息。
  async function getSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SessionDetailResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}`, { signal });
    return sessionDetailResponseSchema.parse(await parseResponse(response));
  }

  // 删除指定会话及其级联消息。
  async function deleteSession(sessionId: string): Promise<DeleteSessionResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return deleteSessionResponseSchema.parse(await parseResponse(response));
  }

  // 持久化会话名称或置顶状态。
  async function updateSession(
    sessionId: string,
    input: UpdateSessionRequest,
  ): Promise<SessionSummary> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return updateSessionResponseSchema.parse(await parseResponse(response)).session;
  }

  // 请求模型根据首轮问答更新会话标题。
  async function generateSessionTitle(
    sessionId: string,
  ): Promise<GenerateSessionTitleResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}/title/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    return generateSessionTitleResponseSchema.parse(await parseResponse(response));
  }

  // 可靠创建一次 Durable Run；幂等键限定本次提交，模型执行会在 HTTP 返回后继续进行。
  async function createRun(
    sessionId: string,
    content: string,
    model: string,
    reasoningEffort: ReasoningEffort,
    attachmentIds: string[] = [],
    artifactVersionContext?: {
      seriesId: string;
      baseArtifactId: string;
      expectedCurrentArtifactId: string;
      changeSummary?: string;
    },
  ): Promise<CreateRunResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        model,
        reasoningEffort,
        idempotencyKey: crypto.randomUUID(),
        ...(attachmentIds.length ? { attachmentIds } : {}),
        ...(artifactVersionContext ? { artifactVersionContext } : {}),
      }),
    });
    return createRunResponseSchema.parse(await parseResponse(response));
  }

  async function getArtifactSeries(seriesId: string): Promise<ArtifactSeriesRef> {
    const response = await fetchFn(`${baseUrl}/api/agent/artifacts/series/${encodeURIComponent(seriesId)}`);
    return artifactSeriesRefSchema.parse(await parseResponse(response));
  }

  async function restoreArtifact(
    artifactId: string,
    expectedCurrentArtifactId: string,
  ): Promise<RestoreArtifactResult> {
    const response = await fetchFn(`${baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedCurrentArtifactId, idempotencyKey: crypto.randomUUID() }),
    });
    return restoreArtifactResultSchema.parse(await parseResponse(response));
  }

  async function uploadFile(
    sessionId: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<FileRef> {
    const body = new FormData();
    body.append('file', file);
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}/files`, {
      method: 'POST',
      body,
      signal,
    });
    return fileRefSchema.parse(await parseResponse(response));
  }

  // 查询文件处理状态，供上传后的轮询使用。
  async function getFile(fileId: string, signal?: AbortSignal): Promise<FileRef> {
    const response = await fetchFn(`${baseUrl}/api/agent/files/${fileId}`, { signal });
    return fileRefSchema.parse(await parseResponse(response));
  }

  // 读取服务端生成的规范化正文，用于文件预览，不重新解析原始 Office/PDF 文件。
  async function getFilePreview(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{ fileId: string; content: string; contentType: string }> {
    const response = await fetchFn(`${baseUrl}/api/agent/files/${fileId}/preview`, { signal });
    const content = await response.text();
    if (!response.ok) throw new Error(content || '文件预览不可用。');
    return {
      fileId,
      content,
      contentType: response.headers.get('content-type') ?? 'text/plain',
    };
  }

  // 请求服务端重新处理可恢复失败的文件。
  async function retryFile(fileId: string): Promise<FileRef> {
    const response = await fetchFn(`${baseUrl}/api/agent/files/${fileId}/retry`, { method: 'POST' });
    return fileRefSchema.parse(await parseResponse(response));
  }

  async function deleteFile(fileId: string): Promise<{ deletedFileId: string }> {
    const response = await fetchFn(`${baseUrl}/api/agent/files/${fileId}`, { method: 'DELETE' });
    const data = await parseResponse(response);
    return { deletedFileId: String((data as { deletedFileId?: unknown }).deletedFileId) };
  }

  async function getArtifact(artifactId: string, signal?: AbortSignal): Promise<ArtifactRef> {
    const response = await fetchFn(`${baseUrl}/api/agent/artifacts/${artifactId}`, { signal });
    return artifactRefSchema.parse(await parseResponse(response));
  }

  async function getReport(
    reportId: string,
    signal?: AbortSignal,
  ): Promise<{ report: ReportRef; artifact: ArtifactRef; file: FileRef }> {
    const response = await fetchFn(
      `${baseUrl}/api/agent/artifacts/reports/${encodeURIComponent(reportId)}`,
      { signal },
    );
    const data = (await parseResponse(response)) as {
      report: unknown;
      artifact: unknown;
      file: unknown;
    };
    return {
      report: reportRefSchema.parse(data.report),
      artifact: artifactRefSchema.parse(data.artifact),
      file: fileRefSchema.parse(data.file),
    };
  }

  async function deleteReport(reportId: string): Promise<{ deletedReportId: string }> {
    const response = await fetchFn(
      `${baseUrl}/api/agent/artifacts/reports/${encodeURIComponent(reportId)}`,
      { method: 'DELETE' },
    );
    const data = (await parseResponse(response)) as { deletedReportId?: unknown };
    return { deletedReportId: String(data.deletedReportId) };
  }

  async function getArtifactPreview(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<{ artifactId: string; content: string; contentType: string }> {
    const response = await fetchFn(`${baseUrl}/api/agent/artifacts/${artifactId}/preview`, {
      signal,
    });
    const content = await response.text();
    if (!response.ok) throw new Error(content || '文件预览不可用。');
    return {
      artifactId,
      content,
      contentType: response.headers.get('content-type') ?? 'text/plain',
    };
  }

  function getArtifactPreviewUrl(artifactId: string): string {
    return `${baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/preview`;
  }

  function getArtifactDownloadUrl(artifactId: string): string {
    return `${baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/download`;
  }

  // 交给浏览器处理受权端点的 Content-Disposition，避免跨源 Blob 请求被 CORS 阻断。
  function downloadArtifact(artifactId: string): void {
    const anchor = document.createElement('a');
    anchor.href = getArtifactDownloadUrl(artifactId);
    anchor.download = '';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  async function deleteArtifact(
    artifactId: string,
  ): Promise<{ deletedArtifactId: string; deletedFileId: string }> {
    const response = await fetchFn(`${baseUrl}/api/agent/artifacts/${artifactId}`, {
      method: 'DELETE',
    });
    const data = await parseResponse(response);
    return {
      deletedArtifactId: String((data as { deletedArtifactId?: unknown }).deletedArtifactId),
      deletedFileId: String((data as { deletedFileId?: unknown }).deletedFileId),
    };
  }

  async function submitPendingInput(sessionId: string, content: string): Promise<unknown> {
    const response = await fetchFn(`${baseUrl}/api/agent/sessions/${sessionId}/pending-inputs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
    });
    return parseResponse(response);
  }
  async function promotePendingInput(inputId: string): Promise<unknown> {
    const response = await fetchFn(`${baseUrl}/api/agent/pending-inputs/${inputId}/steer`, {
      method: 'POST',
    });
    return parseResponse(response);
  }
  async function cancelPendingInput(inputId: string): Promise<unknown> {
    const response = await fetchFn(`${baseUrl}/api/agent/pending-inputs/${inputId}/cancel`, {
      method: 'POST',
    });
    return parseResponse(response);
  }
  async function resumePendingQueue(sessionId: string): Promise<CreateRunResponse> {
    const response = await fetchFn(
      `${baseUrl}/api/agent/sessions/${sessionId}/pending-inputs/resume`,
      { method: 'POST' },
    );
    return createRunResponseSchema.parse(await parseResponse(response));
  }

  async function sendPendingInput(inputId: string): Promise<CreateRunResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/pending-inputs/${inputId}/send`, {
      method: 'POST',
    });
    return createRunResponseSchema.parse(await parseResponse(response));
  }

  async function getPublicAgentConfig(signal?: AbortSignal): Promise<PublicAgentConfig> {
    const response = await fetchFn(`${baseUrl}/api/agent/config/public`, { signal });
    return publicAgentConfigSchema.parse(await parseResponse(response));
  }

  // 获取 Run 的完整恢复快照；服务端优先返回 Live Snapshot，否则退回 PostgreSQL Checkpoint。
  async function getRun(runId: string, signal?: AbortSignal): Promise<RunSnapshot> {
    const response = await fetchFn(`${baseUrl}/api/agent/runs/${runId}`, { signal });
    return runSnapshotSchema.parse(await parseResponse(response));
  }

  // 发送独立、幂等的取消命令；取消不依赖当前 SSE 连接是否仍然存在。
  async function cancelRun(runId: string): Promise<CancelRunResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/runs/${runId}/cancel`, { method: 'POST' });
    return cancelRunResponseSchema.parse(await parseResponse(response));
  }

  async function controlRun(
    runId: string,
    command: RunControlCommand,
  ): Promise<RunControlResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/runs/${runId}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    return runControlResponseSchema.parse(await parseResponse(response));
  }

  // 独立订阅 Run；连接关闭只结束观察，不向后端发送取消命令。
  // lastEventId 是最后成功归约的 cursor，服务端据此选择 Tail replay 或完整 Snapshot fallback。
  async function subscribeRun(
    runId: string,
    lastEventId: number | undefined,
    onEvent: (event: RunStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetchFn(`${baseUrl}/api/agent/runs/${runId}/events`, {
      headers: {
        accept: 'text/event-stream',
        ...(lastEventId !== undefined ? { 'Last-Event-ID': String(lastEventId) } : {}),
      },
      signal,
    });
    if (!response.ok) await parseResponse(response);
    if (!response.body) throw new Error('Run 事件流不可用。');
    // fetch 暴露的是字节流；这里跨网络分片累计文本，直到拼出完整的 SSE frame。
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        // 这里只负责协议解析；Event 是否连续、目标是否存在以及何时推进 cursor 由 app reducer 决定。
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) onEvent(runStreamEventSchema.parse(JSON.parse(data)));
      }
      if (done) return;
    }
  }

  async function listMcpServers(signal?: AbortSignal): Promise<McpServerListResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers`, { signal });
    return mcpServerListResponseSchema.parse(await parseResponse(response));
  }

  async function createMcpServer(body: McpCreateServerRequest): Promise<McpServerView> {
    mcpCreateServerRequestSchema.parse(body);
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await parseResponse(response));
  }

  async function updateMcpServer(id: string, body: McpUpdateServerRequest): Promise<McpServerView> {
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await parseResponse(response));
  }

  async function patchMcpServer(id: string, body: McpPatchServerRequest): Promise<McpServerView> {
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await parseResponse(response));
  }

  async function deleteMcpServer(id: string): Promise<void> {
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers/${id}`, { method: 'DELETE' });
    if (!response.ok) await parseResponse(response);
  }

  async function testMcpServer(id: string): Promise<McpServerTestResponse> {
    const response = await fetchFn(`${baseUrl}/api/agent/mcp/servers/${id}/test`, {
      method: 'POST',
    });
    return mcpServerTestResponseSchema.parse(await parseResponse(response));
  }

  return {
    getReadiness,
    createSession,
    listSessions,
    getSession,
    deleteSession,
    updateSession,
    generateSessionTitle,
    createRun,
    getArtifactSeries,
    restoreArtifact,
    uploadFile,
    getFile,
    getFilePreview,
    retryFile,
    deleteFile,
    getArtifact,
    getReport,
    deleteReport,
    getArtifactPreview,
    getArtifactPreviewUrl,
    getArtifactDownloadUrl,
    downloadArtifact,
    deleteArtifact,
    submitPendingInput,
    promotePendingInput,
    cancelPendingInput,
    resumePendingQueue,
    sendPendingInput,
    getPublicAgentConfig,
    getRun,
    cancelRun,
    controlRun,
    subscribeRun,
    listMcpServers,
    createMcpServer,
    updateMcpServer,
    patchMcpServer,
    deleteMcpServer,
    testMcpServer,
  };
}
