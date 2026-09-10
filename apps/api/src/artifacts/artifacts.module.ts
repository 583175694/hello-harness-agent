import { Module } from '@nestjs/common';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { FilesModule } from '../files/files.module';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

@Module({ imports: [FileStorageModule, FilesModule], controllers: [ArtifactsController], providers: [ArtifactsService], exports: [ArtifactsService] })
export class ArtifactsModule {}
