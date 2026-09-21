import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { FilesModule } from '../files/files.module';
import { ContextEngineeringService } from './context-engineering.service';

@Module({
  imports: [ModelModule, FilesModule],
  providers: [ContextEngineeringService],
  exports: [ContextEngineeringService],
})
export class ContextEngineeringModule {}
