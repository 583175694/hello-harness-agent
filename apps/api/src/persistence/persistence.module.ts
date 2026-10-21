import { Module } from '@nestjs/common';

import { RunStorageModule } from '../run-storage/run-storage.module';
import { AssistantDeliveryRepository } from './assistant-delivery.repository';

@Module({
  imports: [RunStorageModule],
  providers: [AssistantDeliveryRepository],
  exports: [AssistantDeliveryRepository],
})
export class PersistenceModule {}
