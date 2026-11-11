/** 对齐 packages/mobile-contract/design-tokens.json layout + Android HarnessLayout。 */
export class HarnessLayout {
  static readonly CHAT_TURN_VERTICAL_PADDING: number = 8;
  static readonly CHAT_BUBBLE_PADDING_HORIZONTAL: number = 16;
  static readonly CHAT_BUBBLE_PADDING_VERTICAL: number = 12;
  static readonly BUBBLE_RADIUS: number = 22;
  /** 对齐 Web `.assistant-blocks` gap。 */
  static readonly CHAT_ASSISTANT_SECTION_GAP: number = 10;
  static readonly CHAT_ASSISTANT_BODY_PADDING: number = 14;
  static readonly CHAT_ASSISTANT_DELIVERY_EXTRA_TOP: number =
    Math.max(0, HarnessLayout.CHAT_ASSISTANT_BODY_PADDING - HarnessLayout.CHAT_ASSISTANT_SECTION_GAP);
}
