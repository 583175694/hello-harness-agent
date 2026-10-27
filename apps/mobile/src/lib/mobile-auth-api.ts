import {
  authLoginResponseSchema,
  authMeResponseSchema,
  authSendPhoneCodeRequestSchema,
  authVerifyPhoneRequestSchema,
  problemDetailsSchema,
  type AuthUserView,
} from '@harness/agent-protocol';
import { ApiProblem } from '@harness/agent-client';

import { resolveMobileApiBaseUrl } from './agent-client';
import { clearSessionToken, getSessionToken, setSessionToken } from './mobile-auth-storage';

const SESSION_COOKIE_NAME = 'harness_session';

function baseUrl(apiBaseUrl: string): string {
  return resolveMobileApiBaseUrl(apiBaseUrl).replace(/\/$/, '');
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  if (!token) return {};
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function extractSessionToken(response: Response): string | null {
  const fromList = response.headers.getSetCookie?.();
  if (fromList?.length) {
    for (const line of fromList) {
      const match = line.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match?.[1]) return match[1];
    }
  }
  const raw = response.headers.get('set-cookie');
  if (raw) {
    const match = raw.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return null;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }
  return data;
}

export async function getMobileAuthHeaders(): Promise<Record<string, string>> {
  return authHeaders();
}

export async function sendPhoneLoginCode(apiBaseUrl: string, phone: string): Promise<void> {
  authSendPhoneCodeRequestSchema.parse({ phone });
  const response = await fetch(`${baseUrl(apiBaseUrl)}/api/auth/phone/send-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function verifyPhoneLogin(
  apiBaseUrl: string,
  phone: string,
  code: string,
): Promise<AuthUserView> {
  authVerifyPhoneRequestSchema.parse({ phone, code });
  const response = await fetch(`${baseUrl(apiBaseUrl)}/api/auth/phone/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await parseJsonResponse(response);
  const token = extractSessionToken(response);
  if (token) {
    await setSessionToken(token);
  }
  return authLoginResponseSchema.parse(data).user;
}

export async function fetchAuthMe(apiBaseUrl: string, signal?: AbortSignal): Promise<AuthUserView> {
  const response = await fetch(`${baseUrl(apiBaseUrl)}/api/auth/me`, {
    signal,
    headers: { ...(await authHeaders()) },
  });
  const data = await parseJsonResponse(response);
  return authMeResponseSchema.parse(data).user;
}

export async function logoutMobileAuth(apiBaseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl(apiBaseUrl)}/api/auth/logout`, {
    method: 'POST',
    headers: { ...(await authHeaders()) },
  });
  if (!response.ok) {
    await parseJsonResponse(response);
  }
  await clearSessionToken();
}

export function isAuthRequiredError(error: unknown): boolean {
  return error instanceof ApiProblem && error.problem.code === 'AUTH_REQUIRED';
}
