import { Module } from '@nestjs/common';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { FileProcessingService } from './file-processing.service';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [FileStorageModule],
  controllers: [FilesController],
  providers: [FileProcessingService, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
