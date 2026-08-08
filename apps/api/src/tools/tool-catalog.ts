import { WebSearchTool } from './web-search.tool';
import { WebFetchTool } from './web-fetch.tool';
import type { AgentTool } from './agent-tool.types';

// 多工具集合使用的 Nest 注入标识，避免业务服务依赖具体工具类。
export const AGENT_TOOLS = Symbol('AGENT_TOOLS');

// 工具白名单是唯一的注册入口，新增工具时只需在此数组加入实现类。
export const AGENT_TOOL_CLASSES = [WebSearchTool, WebFetchTool] as const;

// 将 catalog 中的工具类实例聚合为 Registry 所需的统一集合。
export const AGENT_TOOLS_PROVIDER = {
  // 向 Nest 声明工具集合的注入标识。
  provide: AGENT_TOOLS,
  // 按 catalog 顺序注入所有已注册工具实现。
  inject: [...AGENT_TOOL_CLASSES],
  // 返回类型收敛为通用工具接口，隐藏具体实现类。
  useFactory: (...tools: AgentTool[]) => tools,
};
