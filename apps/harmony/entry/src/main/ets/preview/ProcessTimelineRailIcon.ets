import { HarnessColors } from '../coreui/HarnessColors';
import {
  processTimelineToolIconGlyph,
  processTimelineToolIconKind,
} from './ProcessTimelineToolIcon';

const RAIL_ICON_SIZE = 15;
const RAIL_NODE_DOT_SIZE = 6;

@Component
export struct ProcessTimelineNodeDot {
  @Prop useDark: boolean = false;

  build() {
    Circle({ width: RAIL_NODE_DOT_SIZE, height: RAIL_NODE_DOT_SIZE })
      .fill(HarnessColors.composerBorder(this.useDark))
  }
}

@Component
export struct ProcessTimelineToolRailIcon {
  @Prop toolName: string = '';
  @Prop status: string = '';
  @Prop useDark: boolean = false;

  private iconColor(): string | Color {
    if (this.status === 'failed') {
      return HarnessColors.dangerText(this.useDark);
    }
    if (this.status === 'running') {
      return HarnessColors.linkText(this.useDark);
    }
    return HarnessColors.mutedText(this.useDark);
  }

  build() {
    Text(processTimelineToolIconGlyph(processTimelineToolIconKind(this.toolName)))
      .fontSize(RAIL_ICON_SIZE)
      .fontWeight(FontWeight.Regular)
      .fontColor(this.iconColor())
      .width(RAIL_ICON_SIZE)
      .height(RAIL_ICON_SIZE)
      .textAlign(TextAlign.Center)
  }
}
