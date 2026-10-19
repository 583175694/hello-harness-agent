import type { FactoryProvider, Type } from '@nestjs/common';
import { WebSearchTool } from './web-search.tool';
import { WebFetchTool } from './web-fetch.tool';
import type { AgentTool } from './agent-tool.types';
import { ApprovalTestTool } from './approval-test.tool';
import { GetCurrentTimeTool } from './get-current-time.tool';
import { FileSearchTool } from './file-search.tool';
import { FileReadTool } from './file-read.tool';
import { FileCreateTool } from './file-create.tool';
import { ReportCreateTool } from './report-create.tool';
import { BashTool } from './bash.tool';
import { JobKillTool, JobListTool, JobOutputTool } from './job.tools';
import {
  ListMcpResourcesTool,
  ListMcpResourceTemplatesTool,
  ReadMcpResourceTool,
} from './mcp-resource.tools';
import { McpAddServerTool } from './mcp-add-server.tool';
import { SkillsListTool, SkillsReadTool } from '../skills/skills.tools';
import { MemoryWriteTool } from '../memory/memory_write.tool';
import { ToolSearchTool } from './tool-exposure/tool-search.tool';

// 多工具集合使用的 Nest 注入标识，避免业务服务依赖具体工具类。
export const AGENT_TOOLS = Symbol('AGENT_TOOLS');

// 工具白名单是唯一的注册入口，新增工具时只需在此数组加入实现类。
export const AGENT_TOOL_CLASSES = [
  // 网页搜索工具，负责从外部 Provider 发现候选线索。
  WebSearchTool,
  // 网页读取工具，负责获取并筛选可定位原文。
  WebFetchTool,
  ApprovalTestTool,
  GetCurrentTimeTool,
  FileSearchTool,
  FileReadTool,
  FileCreateTool,
  ReportCreateTool,
  BashTool,
  JobOutputTool,
  JobListTool,
  JobKillTool,
  ListMcpResourcesTool,
  ListMcpResourceTemplatesTool,
  ReadMcpResourceTool,
  McpAddServerTool,
  SkillsListTool,
  SkillsReadTool,
  ToolSearchTool,
] as const;

// 将 catalog 中的工具类实例聚合为 Registry 所需的统一集合。
// MemoryWriteTool 由 MemoryModule 导出，不在本模块 providers 中重复注册。
export const AGENT_TOOLS_PROVIDER: FactoryProvider<AgentTool[]> = {
  provide: AGENT_TOOLS,
  inject: [...AGENT_TOOL_CLASSES, MemoryWriteTool] as Type[],
  useFactory: (...tools: AgentTool[]) => tools,
};
