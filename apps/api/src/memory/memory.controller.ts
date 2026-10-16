import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { MEMORY_KINDS } from './memory.constants';
import { MemoryEligibilityRejectedError } from './memory.errors';
import { MemoryService } from './memory.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

const createBodySchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1),
  content: z.string().min(1),
});

const updateBodySchema = createBodySchema;

const settingsPatchSchema = z.object({
  allowAgentWrite: z.boolean(),
});

@Controller('api/agent')
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memory: MemoryService) {}

  @Get('memories')
  async list(@CurrentUser() user: RequestUser) {
    return this.memory.listActive(user.id);
  }

  @Post('memories')
  async create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = createBodySchema.parse(body);
    try {
      const record = await this.memory.createFromSettings({
        userId: user.id,
        kind: input.kind,
        title: input.title,
        content: input.content,
      });
      return { memory: record };
    } catch (error) {
      if (error instanceof MemoryEligibilityRejectedError) {
        throw new BadRequestException({
          code: 'memory_write_rejected',
          reason: error.reason,
          detail: error.reason,
        });
      }
      throw error;
    }
  }

  @Patch('memories/:id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') memoryId: string,
    @Body() body: unknown,
  ) {
    const input = updateBodySchema.parse(body);
    try {
      const record = await this.memory.updateFromSettings({
        userId: user.id,
        memoryId,
        kind: input.kind,
        title: input.title,
        content: input.content,
      });
      return { memory: record };
    } catch {
      throw new NotFoundException();
    }
  }

  @Delete('memories/:id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') memoryId: string) {
    try {
      await this.memory.deleteFromSettings(user.id, memoryId);
      return { ok: true };
    } catch {
      throw new NotFoundException();
    }
  }

  @Get('memory-settings')
  async getSettings(@CurrentUser() user: RequestUser) {
    return this.memory.getSettings(user.id);
  }

  @Patch('memory-settings')
  async patchSettings(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = settingsPatchSchema.parse(body);
    return this.memory.patchSettings(user.id, input.allowAgentWrite);
  }
}
