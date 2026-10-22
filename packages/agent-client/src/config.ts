import { publicAgentConfigSchema, type PublicAgentConfig } from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createConfigApi(ctx: ClientContext) {
  async function getPublicAgentConfig(signal?: AbortSignal): Promise<PublicAgentConfig> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/config/public`, { signal });
    return publicAgentConfigSchema.parse(await ctx.parseResponse(response));
  }
  return { getPublicAgentConfig };
}
