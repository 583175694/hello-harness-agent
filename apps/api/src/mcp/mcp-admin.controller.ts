import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  mcpCreateServerRequestSchema,
  mcpPatchServerRequestSchema,
  mcpUpdateServerRequestSchema,
} from '@harness/agent-protocol';
import { McpAdminService } from './mcp-admin.service';

@Controller('api/agent/mcp')
export class McpAdminController {
  constructor(@Inject(McpAdminService) private readonly admin: McpAdminService) {}

  @Get('servers')
  listServers() {
    return this.admin.listServers();
  }

  @Post('servers')
  createServer(@Body() body: unknown) {
    const parsed = mcpCreateServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 创建请求无效。');
    return this.admin.createServer(parsed.data);
  }

  @Put('servers/:id')
  updateServer(@Param('id') id: string, @Body() body: unknown) {
    const parsed = mcpUpdateServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 更新请求无效。');
    return this.admin.updateServer(id, parsed.data);
  }

  @Patch('servers/:id')
  patchServer(@Param('id') id: string, @Body() body: unknown) {
    const parsed = mcpPatchServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 局部更新请求无效。');
    return this.admin.patchServer(id, parsed.data);
  }

  @Delete('servers/:id')
  @HttpCode(204)
  async deleteServer(@Param('id') id: string) {
    await this.admin.deleteServer(id);
  }

  @Post('servers/:id/test')
  @HttpCode(200)
  testServer(@Param('id') id: string) {
    return this.admin.testServer(id);
  }

  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}
