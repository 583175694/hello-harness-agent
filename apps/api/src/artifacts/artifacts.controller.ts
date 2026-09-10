import { Controller, Delete, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ArtifactsService } from './artifacts.service';

@Controller('api/agent/artifacts')
export class ArtifactsController {
  constructor(@Inject(ArtifactsService) private readonly artifacts: ArtifactsService) {}

  @Get(':artifactId')
  get(@Param('artifactId') artifactId: string) { return this.artifacts.get(artifactId); }

  @Get(':artifactId/preview')
  async preview(@Param('artifactId') artifactId: string, @Res() response: Response) {
    const result = await this.artifacts.preview(artifactId);
    if ('url' in result && result.url) return response.redirect(302, result.url);
    response.type(result.contentType);
    return response.send(result.content);
  }

  @Get(':artifactId/download')
  async download(@Param('artifactId') artifactId: string, @Res() response: Response) {
    const result = await this.artifacts.download(artifactId);
    response.type(result.mediaType);
    response.attachment(result.fileName);
    return response.send(result.content);
  }

  @Delete(':artifactId')
  delete(@Param('artifactId') artifactId: string) { return this.artifacts.delete(artifactId); }
}
