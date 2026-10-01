import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { SkillRegistryService } from './skill-registry.service';
import type { AgentTool, AgentToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';

const listSchema = z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(100).optional() });
const readSchema = z.object({ name: z.string().min(1), version: z.string().optional() });

@Injectable()
export class SkillsListTool implements AgentTool {
  readonly name = AGENT_TOOL_NAMES.skillsList;
  readonly inputSchema = listSchema;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'auto_execute' as const };
  constructor(private readonly registry: SkillRegistryService) {}
  definition(): AgentToolDefinition { return { name: this.name, description: 'Search the available Skill catalog. This is optional; use skills.read to load a Skill body.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } }; }
  isAvailable(): boolean { return true; }
  async execute(input: z.infer<typeof listSchema>, context: ToolExecutionContext): Promise<ToolExecutionResult<unknown>> { void context; return { status: 'succeeded', output: { skills: this.registry.list(input.query, input.limit) } }; }
}

@Injectable()
export class SkillsReadTool implements AgentTool {
  readonly name = AGENT_TOOL_NAMES.skillsRead;
  readonly inputSchema = readSchema;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'auto_execute' as const };
  constructor(private readonly registry: SkillRegistryService) {}
  definition(): AgentToolDefinition { return { name: this.name, description: 'Load the full instructions for one available Skill.', parameters: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name'], additionalProperties: false } }; }
  isAvailable(): boolean { return true; }
  async execute(input: z.infer<typeof readSchema>, context: ToolExecutionContext): Promise<ToolExecutionResult<unknown>> { void context; try { const skill = this.registry.read(input.name, input.version); return { status: 'succeeded', output: this.registry.render(skill) }; } catch (error) { return { status: 'failed', error: { code: error instanceof Error ? error.message : 'SKILL_READ_FAILED', detail: 'Skill 不存在、版本不匹配或不可调用。', retryable: false } }; } }
}
