import { ComposerPreviewState } from './PreviewModels';
import { PreviewComposerBar } from './PreviewComposerBar';

/** Pattern：ComposerStack（Gate A 命名对齐 Android/iOS）。 */
@Component
export struct PreviewComposerStack {
  @Prop composer: ComposerPreviewState;
  @Prop modelLabelOverride: string = '';
  @Prop useDark: boolean = false;
  @Prop workbenchOpen: boolean = false;
  onModelClick: () => void = () => {
  };
  onAttachClick: () => void = () => {
  };
  onSkillClick: () => void = () => {
  };
  onPreviewAction: (action: import('./PreviewSessionReducer').PreviewUiAction) => void = () => {
  };

  build() {
    PreviewComposerBar({
      composer: this.composer,
      modelLabelOverride: this.modelLabelOverride,
      useDark: this.useDark,
      workbenchOpen: this.workbenchOpen,
      onModelClick: () => this.onModelClick(),
      onAttachClick: () => this.onAttachClick(),
      onSkillClick: () => this.onSkillClick(),
      onPreviewAction: (action) => this.onPreviewAction(action),
    })
  }
}
