import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/PreviewChatPage', (err) => {
      if (err.code) {
        console.error(`loadContent failed: ${JSON.stringify(err)}`);
      }
    });
  }
}
