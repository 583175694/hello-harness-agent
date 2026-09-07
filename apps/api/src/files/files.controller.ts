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
import { FilesService } from './files.service';
import { MAX_FILE_BYTES } from './file-processing.service';

// 文件接口只负责 HTTP 适配，归属、存储和状态转换统一交给 FilesService。
@Controller('api/agent')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  // 接收单个 multipart 文件；文本类文件先返回 processing，再异步更新状态。
  @Post('sessions/:sessionId/files')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: MAX_FILE_BYTES } }))
  upload(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file)
      throw new BadRequestException({ code: 'FILE_REQUIRED', detail: '必须上传一个文件。' });
    return this.files.upload(sessionId, file);
  }

  // 查询脱敏后的文件元数据，供前端轮询处理状态。
  @Get('files/:fileId')
  get(@Param('fileId') fileId: string) {
    return this.files.get(fileId);
  }

  // 重新处理服务端标记为可重试的文件。
  @Post('files/:fileId/retry')
  retry(@Param('fileId') fileId: string) {
    return this.files.retry(fileId);
  }

  // 图片跳转短期预览地址，文本类文件直接返回规范化内容。
  @Get('files/:fileId/preview')
  async preview(@Param('fileId') fileId: string, @Res() response: Response) {
    const result = await this.files.preview(fileId);
    if ('url' in result && result.url) return response.redirect(302, result.url);
    if ('content' in result) {
      response.type(result.contentType ?? 'text/plain');
      return response.send(result.content);
    }
    throw new BadRequestException({ code: 'FILE_PREVIEW_UNAVAILABLE', detail: '文件预览不可用。' });
  }

  // 仅删除尚未绑定消息的文件，存储失败由服务层记录补偿任务。
  @Delete('files/:fileId')
  delete(@Param('fileId') fileId: string) {
    return this.files.deleteUnbound(fileId);
  }

  // 仅供 LocalFileStorage 开发环境读取内容，生产 COS 不经过该路由。
  @Get('files/:fileId/content/:variant')
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
