import { fileIo } from '@kit.CoreFileKit';
import { systemShare } from '@kit.ArkShareKit';
import { common } from '@kit.AbilityKit';

/** Workbench / Reader 下载后走系统分享（对齐 Android DeliverableExporter）。 */
export class HarmonyDeliverableExporter {
  static async shareBytes(
    uiContext: common.UIAbilityContext,
    data: ArrayBuffer,
    fileName: string,
    contentType: string,
  ): Promise<void> {
    const safeName = (fileName.length > 0 ? fileName : 'download').replace(/\//g, '_');
    const path = `${uiContext.cacheDir}/${safeName}`;
    const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
    fileIo.writeSync(file.fd, data);
    fileIo.closeSync(file);
    await systemShare.ShareData.share({
      uri: `file://${path}`,
      utd: contentType.length > 0 ? contentType : 'application/octet-stream',
      title: safeName,
    }, { previewMode: systemShare.SharePreviewMode.DETAIL, selectionMode: systemShare.SelectionMode.SINGLE });
  }
}
