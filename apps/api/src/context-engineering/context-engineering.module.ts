import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { ContextEngineeringService } from './context-engineering.service';

@Module({
  imports: [ModelModule],
  providers: [ContextEngineeringService],
  exports: [ContextEngineeringService],
})
export class ContextEngineeringModule {}
