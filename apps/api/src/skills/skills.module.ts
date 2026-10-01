import { Module } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';
import { SkillsListTool, SkillsReadTool } from './skills.tools';
import { SkillsController } from './skills.controller';

@Module({ controllers: [SkillsController], providers: [SkillRegistryService, SkillsListTool, SkillsReadTool], exports: [SkillRegistryService, SkillsListTool, SkillsReadTool] })
export class SkillsModule {}
