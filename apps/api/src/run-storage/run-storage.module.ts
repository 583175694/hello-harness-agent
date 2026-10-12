import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RunProjectionArchiver } from './run-projection.archiver';
import {
  CosRunObjectStorage,
  LocalRunObjectStorage,
  RunObjectStorage,
} from './run-object.storage';
import { RunToolOutputRepository } from './run-tool-output.repository';

@Module({
  providers: [
    CosRunObjectStorage,
    LocalRunObjectStorage,
    RunToolOutputRepository,
    RunProjectionArchiver,
    {
      provide: RunObjectStorage,
      inject: [ConfigService, CosRunObjectStorage, LocalRunObjectStorage],
      useFactory: (
        config: ConfigService,
        cos: CosRunObjectStorage,
        local: LocalRunObjectStorage,
      ) =>
        config.get('COS_BUCKET') && config.get('COS_SECRET_ID') && config.get('COS_SECRET_KEY')
          ? cos
          : local,
    },
  ],
  exports: [RunObjectStorage, RunToolOutputRepository, RunProjectionArchiver],
})
export class RunStorageModule {}
