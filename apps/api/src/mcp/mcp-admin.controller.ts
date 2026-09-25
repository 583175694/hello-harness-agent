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
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { McpAdminService } from './mcp-admin.service';

@Controller('api/agent/mcp')
export class McpAdminController {
  constructor(@Inject(McpAdminService) private readonly admin: McpAdminService) {}

  @Get('servers')
  listServers(@CurrentUser() user: RequestUser) {
    return this.admin.listServers(user.id);
  }

  @Post('servers')
  createServer(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = mcpCreateServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 创建请求无效。');
    return this.admin.createServer(user.id, parsed.data);
  }

  @Put('servers/:id')
  updateServer(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = mcpUpdateServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 更新请求无效。');
    return this.admin.updateServer(user.id, id, parsed.data);
  }

  @Patch('servers/:id')
  patchServer(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = mcpPatchServerRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('MCP Server 局部更新请求无效。');
    return this.admin.patchServer(user.id, id, parsed.data);
  }

  @Delete('servers/:id')
  @HttpCode(204)
  async deleteServer(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.admin.deleteServer(user.id, id);
  }

  @Post('servers/:id/test')
  @HttpCode(200)
  testServer(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.admin.testServer(user.id, id);
  }

  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}
