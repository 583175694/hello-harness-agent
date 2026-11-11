import { picker } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';

export interface PickedAttachment {
  fileName: string;
  mediaType: string;
  data: ArrayBuffer;
}

/** Core 联调：系统文档选择器 → 读入内存供 multipart 上传。 */
export class HarmonyAttachmentPicker {
  static async pickOne(): Promise<PickedAttachment | null> {
    const options = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    const viewPicker = new picker.DocumentViewPicker();
    const uris = await viewPicker.select(options);
    if (uris.length === 0) {
      return null;
    }
    const uri = uris[0];
    const fileName = HarmonyAttachmentPicker.fileNameFromUri(uri);
    const file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    try {
      const stat = fs.statSync(uri);
      const size = stat.size;
      if (size <= 0) {
        return null;
      }
      const buffer = new ArrayBuffer(size);
      fs.readSync(file.fd, buffer);
      return {
        fileName,
        mediaType: HarmonyAttachmentPicker.guessMime(fileName),
        data: buffer,
      };
    } finally {
      fs.closeSync(file);
    }
  }

  private static fileNameFromUri(uri: string): string {
    const decoded = decodeURIComponent(uri);
    const slash = decoded.lastIndexOf('/');
    const raw = slash >= 0 ? decoded.substring(slash + 1) : decoded;
    return raw.length > 0 ? raw : 'upload.bin';
  }

  private static guessMime(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lower.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (lower.endsWith('.txt')) {
      return 'text/plain';
    }
    if (lower.endsWith('.md')) {
      return 'text/markdown';
    }
    return 'application/octet-stream';
  }
}
