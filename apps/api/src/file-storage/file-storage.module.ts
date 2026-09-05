import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorage, CosFileStorage, LocalFileStorage } from './file-storage';

@Module({
  providers: [
    CosFileStorage,
    LocalFileStorage,
    {
      provide: FileStorage,
      inject: [ConfigService, CosFileStorage, LocalFileStorage],
      useFactory: (config: ConfigService, cos: CosFileStorage, local: LocalFileStorage) =>
        config.get('COS_BUCKET') && config.get('COS_SECRET_ID') && config.get('COS_SECRET_KEY')
          ? cos
          : local,
    },
  ],
  exports: [FileStorage],
})
export class FileStorageModule {}
