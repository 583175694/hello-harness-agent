import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RunCommandService } from '../../../src/runs/run-command.service';
import { SkillRegistryService } from '../../../src/skills/skill-registry.service';

describe('RunCommandService skillNames validation', () => {
  it('rejects unknown skills before creating a run', async () => {
    const skillRegistry = new SkillRegistryService();
    const service = new RunCommandService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      skillRegistry,
    );

    await expect(
      service.create('user-1', 'session-1', {
        content: '请总结要点',
        idempotencyKey: 'key-1',
        model: 'deepseek-flash',
        skillNames: ['not-a-real-skill'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
