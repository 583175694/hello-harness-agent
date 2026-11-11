import {
  authBindEmailRequestSchema,
  authBindPhoneRequestSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  authSendEmailCodeRequestSchema,
  authSendPhoneCodeRequestSchema,
  authVerifyEmailRequestSchema,
  authVerifyPhoneRequestSchema,
  problemDetailsSchema,
  type AuthUserView,
} from '@harness/agent-protocol';
import {
  ApiProblem,
  createAgentClient,
  createClientId,
  type MessageDeltaEvent,
  type MessageDiscardedEvent,
  type MessagePhaseCompletedEvent,
  type ModelRoundCompletedEvent,
  type ReasoningDeltaEvent,
  type ToolStreamEvent,
} from '@harness/agent-client';

export {
  ApiProblem,
  createClientId,
  type MessageDeltaEvent,
  type MessageDiscardedEvent,
  type MessagePhaseCompletedEvent,
  type ModelRoundCompletedEvent,
  type ReasoningDeltaEvent,
  type ToolStreamEvent,
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'include', ...init });
}

const agent = createAgentClient({
  baseUrl: apiBaseUrl,
  credentials: 'include',
  fetch: apiFetch,
});

export const {
  getReadiness,
  createSession,
  listSessions,
  getSession,
  deleteSession,
  updateSession,
  generateSessionTitle,
  createRun,
  listSkills,
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
  loadArtifactPreviewImageObjectUrl,
  deleteArtifact,
  submitPendingInput,
  promotePendingInput,
  cancelPendingInput,
  resumePendingQueue,
  sendPendingInput,
  getPublicAgentConfig,
  getRun,
  getRunDetail,
  getRunToolOutputUrl,
  cancelRun,
  controlRun,
  subscribeRun,
  listMcpServers,
  createMcpServer,
  updateMcpServer,
  patchMcpServer,
  deleteMcpServer,
  testMcpServer,
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  readMemorySettings,
  patchMemorySettings,
} = agent;

const AUTH_RESPONSE_PARSE_ERROR = '登录状态同步失败，请刷新页面后重试。';

async function parseResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new ApiProblem(problemDetailsSchema.parse(data));
  return data;
}

function parseAuthLoginUser(data: unknown): AuthUserView {
  const parsed = authLoginResponseSchema.safeParse(data);
  if (parsed.success) return parsed.data.user;
  if (import.meta.env.DEV) console.error('[auth] login response schema mismatch', parsed.error.flatten());
  throw new Error(AUTH_RESPONSE_PARSE_ERROR);
}

function parseAuthMeUser(data: unknown): AuthUserView {
  const parsed = authMeResponseSchema.safeParse(data);
  if (parsed.success) return parsed.data.user;
  if (import.meta.env.DEV) console.error('[auth] me response schema mismatch', parsed.error.flatten());
  throw new Error(AUTH_RESPONSE_PARSE_ERROR);
}

export async function sendEmailCode(email: string): Promise<void> {
  authSendEmailCodeRequestSchema.parse({ email });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/email/send-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) await parseResponse(response);
}

export async function verifyEmailLogin(email: string, code: string): Promise<AuthUserView> {
  authVerifyEmailRequestSchema.parse({ email, code });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/email/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  return parseAuthLoginUser(await parseResponse(response));
}

export async function sendPhoneCode(phone: string): Promise<void> {
  authSendPhoneCodeRequestSchema.parse({ phone });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/phone/send-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) await parseResponse(response);
}

export async function verifyPhoneLogin(phone: string, code: string): Promise<AuthUserView> {
  authVerifyPhoneRequestSchema.parse({ phone, code });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/phone/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  return parseAuthLoginUser(await parseResponse(response));
}

export async function getMe(signal?: AbortSignal): Promise<AuthUserView> {
  const response = await apiFetch(`${apiBaseUrl}/api/auth/me`, { signal });
  return parseAuthMeUser(await parseResponse(response));
}

export async function logout(): Promise<void> {
  const response = await apiFetch(`${apiBaseUrl}/api/auth/logout`, { method: 'POST' });
  if (!response.ok) await parseResponse(response);
}

export async function bindEmail(email: string, code: string): Promise<AuthUserView> {
  authBindEmailRequestSchema.parse({ email, code });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/bind/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  return parseAuthLoginUser(await parseResponse(response));
}

export async function bindPhone(phone: string, code: string): Promise<AuthUserView> {
  authBindPhoneRequestSchema.parse({ phone, code });
  const response = await apiFetch(`${apiBaseUrl}/api/auth/bind/phone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  return parseAuthLoginUser(await parseResponse(response));
}
