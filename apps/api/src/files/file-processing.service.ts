import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_DECODED_PIXELS = 40_000_000;

@Injectable()
export class FileProcessingService {
  /** 校验图片内容、读取尺寸并生成受限大小的 WebP 预览图。 */
  async process(file: { buffer: Buffer; mimetype: string; originalname: string }) {
    if (file.buffer.length === 0) throw this.reject('FILE_EMPTY', '文件为空。');
    if (file.buffer.length > MAX_FILE_BYTES)
      throw this.reject('FILE_TOO_LARGE', '文件超过 20 MiB 限制。');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype))
      throw this.reject('FILE_TYPE_UNSUPPORTED', '仅支持 PNG、JPEG 和 WebP 图片。');
    if (!this.matchesMagic(file.buffer, file.mimetype))
      throw this.reject('FILE_SIGNATURE_MISMATCH', '文件类型与实际内容不一致。');

    try {
      const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: MAX_DECODED_PIXELS });
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      if (!width || !height || width * height > MAX_DECODED_PIXELS)
        throw this.reject('IMAGE_DIMENSIONS_INVALID', '图片尺寸超过处理限制。');
      const preview = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return {
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        mediaType: file.mimetype,
        fileName: file.originalname,
        size: file.buffer.length,
        width,
        height,
        preview,
        previewType: 'image/webp',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.reject('IMAGE_DECODE_FAILED', '图片无法解码或处理失败。');
    }
  }

  /** 根据声明的媒体类型校验文件头魔数，避免仅信任扩展名或 MIME。 */
  private matchesMagic(buffer: Buffer, mediaType: string): boolean {
    if (mediaType === 'image/png')
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      );
    if (mediaType === 'image/jpeg')
      return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if (mediaType === 'image/webp')
      return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    return false;
  }

  /** 创建统一格式的图片拒绝异常，供 API 层直接返回稳定错误码。 */
  private reject(code: string, detail: string): BadRequestException {
    return new BadRequestException({ code, detail });
  }
}
