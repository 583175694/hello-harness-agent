import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Delete,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { FilesService } from './files.service';
import { MAX_FILE_BYTES } from './file-processing.service';

@Controller('api/agent')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post('sessions/:sessionId/files')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: MAX_FILE_BYTES } }))
  upload(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file)
      throw new BadRequestException({ code: 'FILE_REQUIRED', detail: '必须上传一个文件。' });
    return this.files.upload(user.id, sessionId, file);
  }

  @Get('files/:fileId')
  get(@CurrentUser() user: RequestUser, @Param('fileId') fileId: string) {
    return this.files.get(user.id, fileId);
  }

  @Post('files/:fileId/retry')
  retry(@CurrentUser() user: RequestUser, @Param('fileId') fileId: string) {
    return this.files.retry(user.id, fileId);
  }

  @Get('files/:fileId/preview')
  async preview(
    @CurrentUser() user: RequestUser,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ) {
    const result = await this.files.preview(user.id, fileId);
    if ('url' in result && result.url) return response.redirect(302, result.url);
    if ('content' in result) {
      response.type(result.contentType ?? 'text/plain');
      return response.send(result.content);
    }
    throw new BadRequestException({ code: 'FILE_PREVIEW_UNAVAILABLE', detail: '文件预览不可用。' });
  }

  @Delete('files/:fileId')
  delete(@CurrentUser() user: RequestUser, @Param('fileId') fileId: string) {
    return this.files.deleteUnbound(user.id, fileId);
  }

  @Get('files/:fileId/content/:variant')
  async content(
    @CurrentUser() user: RequestUser,
    @Param('fileId') fileId: string,
    @Param('variant') variant: 'original' | 'preview',
    @Res() response: Response,
  ) {
    if (variant !== 'original' && variant !== 'preview')
      throw new BadRequestException({ code: 'FILE_VARIANT_INVALID', detail: '文件版本无效。' });
    const result = await this.files.localContent(user.id, fileId, variant);
    response.type(result.contentType);
    return response.send(result.content);
  }
}
