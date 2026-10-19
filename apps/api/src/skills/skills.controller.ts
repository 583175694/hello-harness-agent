import { Controller, Get, Inject, Query } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';

@Controller('api/skills')
export class SkillsController {
  constructor(@Inject(SkillRegistryService) private readonly registry: SkillRegistryService) {}
  @Get()
  list(@Query('query') query?: string, @Query('limit') limit?: string) {
    return { skills: this.registry.list(query, limit ? Number(limit) : undefined) };
  }
}
