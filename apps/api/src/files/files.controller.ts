import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { MAX_FILE_BYTES } from './file-processing.service';

@Controller('api/agent')
export class FilesController {
  // 注入文件服务，由服务层统一处理权限、校验、存储和状态转换。
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post('sessions/:sessionId/files')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: MAX_FILE_BYTES } }))
  // 接收单个 multipart 文件，具体校验和同步处理交给 FilesService。
  upload(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file)
      throw new BadRequestException({ code: 'FILE_REQUIRED', detail: '必须上传一个图片文件。' });
    return this.files.upload(sessionId, file);
  }

  @Get('files/:fileId/preview')
  // 先校验当前用户归属，再在响应时生成短期预览地址。
  async preview(@Param('fileId') fileId: string, @Res() response: Response) {
    const result = await this.files.preview(fileId);
    return response.redirect(302, result.url);
  }

  // 本地开发时为 LocalFileStorage 的地址提供内容路由；生产 COS 请求不会经过这里，
  // 而是直接跳转到 COS 签名地址。
  @Get('files/:fileId/content/:variant')
  // 仅供 LocalFileStorage 使用，生产环境的 COS 地址不会经过该路由。
  async content(
    @Param('fileId') fileId: string,
    @Param('variant') variant: 'original' | 'preview',
    @Res() response: Response,
  ) {
    if (variant !== 'original' && variant !== 'preview')
      throw new BadRequestException({ code: 'FILE_VARIANT_INVALID', detail: '文件版本无效。' });
    const result = await this.files.localContent(fileId, variant);
    response.type(result.contentType);
    return response.send(result.content);
  }
}
