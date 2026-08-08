import { Module } from '@nestjs/common';

import { AssistantDeliveryRepository } from './assistant-delivery.repository';

@Module({ providers: [AssistantDeliveryRepository], exports: [AssistantDeliveryRepository] })
export class PersistenceModule {}
