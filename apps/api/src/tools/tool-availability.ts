import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

// 统一维护内置 Agent 工具的启用状态。关闭工具时，注册表会同时从模型声明
// 和实际执行入口屏蔽它，避免只改一处造成“模型还能调用但服务拒绝”的漂移。
export const TOOL_AVAILABILITY: Readonly<Record<string, boolean>> = {
  [AGENT_TOOL_NAMES.webSearch]: true,
  [AGENT_TOOL_NAMES.webFetch]: false,
  [AGENT_TOOL_NAMES.approvalTest]: true,
  [AGENT_TOOL_NAMES.getCurrentTime]: true,
  [AGENT_TOOL_NAMES.searchFile]: true,
  [AGENT_TOOL_NAMES.readFileLines]: true,
  [AGENT_TOOL_NAMES.createFile]: true,
  [AGENT_TOOL_NAMES.createReport]: true,
  [AGENT_TOOL_NAMES.executeCommand]: true,
  [AGENT_TOOL_NAMES.bash]: true,
  [AGENT_TOOL_NAMES.jobOutput]: true,
  [AGENT_TOOL_NAMES.jobList]: true,
  [AGENT_TOOL_NAMES.jobKill]: true,
  [AGENT_TOOL_NAMES.listMcpResources]: true,
  [AGENT_TOOL_NAMES.listMcpResourceTemplates]: true,
  [AGENT_TOOL_NAMES.readMcpResource]: true,
};

export function isToolEnabled(name: string): boolean {
  return TOOL_AVAILABILITY[name] ?? true;
}
