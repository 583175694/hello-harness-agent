import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { restoreArtifactRequestSchema } from '@harness/agent-protocol';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { ArtifactsService } from './artifacts.service';

@Controller('api/agent/artifacts')
export class ArtifactsController {
  constructor(@Inject(ArtifactsService) private readonly artifacts: ArtifactsService) {}

  @Get('reports/:reportId')
  getReport(@CurrentUser() user: RequestUser, @Param('reportId') reportId: string) {
    return this.artifacts.getReport(user.id, reportId);
  }

  @Delete('reports/:reportId')
  deleteReport(@CurrentUser() user: RequestUser, @Param('reportId') reportId: string) {
    return this.artifacts.deleteReport(user.id, reportId);
  }

  @Get('series/:seriesId')
  getSeries(@CurrentUser() user: RequestUser, @Param('seriesId') seriesId: string) {
    return this.artifacts.getSeries(user.id, seriesId);
  }

  @Post(':artifactId/restore')
  restore(
    @CurrentUser() user: RequestUser,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
  ) {
    const parsed = restoreArtifactRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_ARTIFACT_RESTORE_REQUEST',
        detail: '恢复请求不合法。',
      });
    return this.artifacts.restore(
      user.id,
      artifactId,
      parsed.data.expectedCurrentArtifactId,
      parsed.data.idempotencyKey,
    );
  }

  @Get(':artifactId')
  get(@CurrentUser() user: RequestUser, @Param('artifactId') artifactId: string) {
    return this.artifacts.get(user.id, artifactId);
  }

  @Get(':artifactId/preview')
  async preview(
    @CurrentUser() user: RequestUser,
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    const result = await this.artifacts.preview(user.id, artifactId);
    if ('url' in result && result.url) return response.redirect(302, result.url);
    response.type(result.contentType);
    return response.send(result.content);
  }

  @Get(':artifactId/download')
  async download(
    @CurrentUser() user: RequestUser,
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    const result = await this.artifacts.download(user.id, artifactId);
    response.type(result.mediaType);
    response.attachment(result.fileName);
    return response.send(result.content);
  }

  @Delete(':artifactId')
  delete(@CurrentUser() user: RequestUser, @Param('artifactId') artifactId: string) {
    return this.artifacts.delete(user.id, artifactId);
  }
}
