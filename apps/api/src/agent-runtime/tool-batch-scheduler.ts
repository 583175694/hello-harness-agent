import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { isMcpPublicToolName } from '../mcp/mcp.types';
export type ToolApprovalPolicy = 'auto_execute' | 'require_approval' | 'direct_reject';

/** 同批只读工具最大并发数，避免瞬时打满外部 API / MCP 连接或触发限流。 */
export const TOOL_BATCH_MAX_CONCURRENCY = 4;

const PARALLEL_SAFE_BUILTIN_TOOLS = new Set<string>([
  AGENT_TOOL_NAMES.webSearch,
  AGENT_TOOL_NAMES.webFetch,
  AGENT_TOOL_NAMES.readFile,
  AGENT_TOOL_NAMES.readFileLines,
  AGENT_TOOL_NAMES.searchFile,
  AGENT_TOOL_NAMES.getCurrentTime,
  AGENT_TOOL_NAMES.jobList,
]);

const TIME_SENSITIVE_TOOLS = new Set<string>([
  AGENT_TOOL_NAMES.getCurrentTime,
  AGENT_TOOL_NAMES.jobList,
]);

/** 判断工具在同批内是否可安全并行执行（无写副作用、无需人工审批）。 */
export function isParallelSafeTool(
  resolvedToolName: string,
  approvalPolicy: ToolApprovalPolicy,
): boolean {
  if (approvalPolicy !== 'auto_execute') return false;
  if (PARALLEL_SAFE_BUILTIN_TOOLS.has(resolvedToolName)) return true;
  return isMcpPublicToolName(resolvedToolName);
}

/** 判断只读工具是否适合做同 Run 相同参数幂等去重（排除时间敏感查询）。 */
export function isRunDedupEligibleTool(
  resolvedToolName: string,
  approvalPolicy: ToolApprovalPolicy,
): boolean {
  if (!isParallelSafeTool(resolvedToolName, approvalPolicy)) return false;
  return !TIME_SENSITIVE_TOOLS.has(resolvedToolName);
}

/** 受控并发执行异步任务，返回结果数组严格保持与输入相同的下标顺序。 */
export async function runWithConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const current = nextIndex;
      if (current >= items.length) return;
      nextIndex += 1;
      results[current] = await worker(items[current]!, current);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
