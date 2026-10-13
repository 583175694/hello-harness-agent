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
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AGENT_ERROR_CODES,
  mcpCreateServerRequestSchema,
  mcpPatchServerRequestSchema,
  mcpUpdateServerRequestSchema,
} from '@harness/agent-protocol';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { McpAdminService } from './mcp-admin.service';
import { McpIconProxyService } from './mcp-icon-proxy.service';

@Controller('api/agent/mcp')
export class McpAdminController {
  constructor(
    @Inject(McpAdminService) private readonly admin: McpAdminService,
    @Inject(McpIconProxyService) private readonly icons: McpIconProxyService,
  ) {}

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

  /** 同源代理 MCP 图标（https / data URI），供 Web CoT 与设置页展示。 */
  @Get('icon')
  async icon(
    @CurrentUser() _user: RequestUser,
    @Query('src') src: string | undefined,
    @Res() res: Response,
  ) {
    if (!src?.trim()) this.invalid('缺少 src 参数。');
    const { body, mimeType } = await this.icons.resolve(src);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(body);
  }

  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}
