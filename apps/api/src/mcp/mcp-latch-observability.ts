import { getDeepSeekV3TokenEstimator } from '@harness/deepseek-v3-tokenizer';
import type { McpToolCatalogEntry } from './mcp.types';

export const MCP_DEFINITIONS_TOKEN_WARN_THRESHOLD = 32_000;

const estimator = getDeepSeekV3TokenEstimator();

export async function estimateMcpDefinitionTokens(
  entries: ReadonlyArray<McpToolCatalogEntry>,
): Promise<number> {
  if (!entries.length) return 0;
  const payload = entries.map((entry) => ({
    name: entry.publicName,
    description: entry.description,
    parameters: entry.parameters,
  }));
  return estimator.countText(JSON.stringify(payload));
}
