import { ComposerPreviewState } from './PreviewModels';
import { PreviewComposerBar } from './PreviewComposerBar';
import { PreviewComposerBlockKind } from './PreviewAuth';

/** Pattern：ComposerStack（Gate A 命名对齐 Android/iOS）。 */
@Component
export struct PreviewComposerStack {
  @Prop composer: ComposerPreviewState;
  @Prop modelLabelOverride: string = '';
  @Prop selectedModelId: string = '';
  @Prop selectedReasoningEffort: string = '';
  @Prop useDark: boolean = false;
  @Prop workbenchOpen: boolean = false;
  @Prop composerBlock: PreviewComposerBlockKind = PreviewComposerBlockKind.NONE;
  onLoginClick: () => void = () => {
  };
  onModelClick: () => void = () => {
  };
  onAttachClick: () => void = () => {
  };
  onSkillClick: () => void = () => {
  };
  onPreviewAction: (action: import('./PreviewSessionReducer').PreviewUiAction) => void = () => {
  };
  onSendComposerText: (text: string, modelId: string, reasoningEffort: string,
    skillNames: string[], onAccepted: (accepted: boolean) => void) => void = () => {
  };
  onClearComposerRevisionSeed: () => void = () => {
  };

  build() {
    PreviewComposerBar({
      composer: this.composer,
      modelLabelOverride: this.modelLabelOverride,
      selectedModelId: this.selectedModelId,
      selectedReasoningEffort: this.selectedReasoningEffort,
      useDark: this.useDark,
      workbenchOpen: this.workbenchOpen,
      composerBlock: this.composerBlock,
      onLoginClick: () => this.onLoginClick(),
      onModelClick: () => this.onModelClick(),
      onAttachClick: () => this.onAttachClick(),
      onSkillClick: () => this.onSkillClick(),
      onPreviewAction: (action) => this.onPreviewAction(action),
      onSendComposerText: (text, modelId, reasoningEffort, skillNames, onAccepted) =>
        this.onSendComposerText(text, modelId, reasoningEffort, skillNames, onAccepted),
      onClearComposerRevisionSeed: () => this.onClearComposerRevisionSeed(),
    })
  }
}
