/** 与 packages/mobile-contract/design-tokens.json 对齐（Gate A core-ui）。 */
export class HarnessColors {
  static readonly canvas: string = '#F7F7F6';
  static readonly surface: string = '#FFFFFF';
  static readonly subtle: string = '#F1F1EF';
  static readonly userBubble: string = '#EDF3FE';
  static readonly userBubbleBorder: string = '#DBE6F8';
  static readonly composerBorder: string = '#EDEDEB';
  static readonly primary: string = '#171717';
  static readonly secondary: string = '#555551';
  static readonly muted: string = '#898986';
  static readonly border: string = '#DEDEDB';
  static readonly link: string = '#3F5F78';
  static readonly danger: string = '#984B41';
  static readonly dangerBg: string = '#F8ECEA';
  static readonly approvalBg: string = '#EAF2EC';
  static readonly canvasDark: string = '#101010';
  static readonly surfaceDark: string = '#181818';
  static readonly subtleDark: string = '#202020';
  static readonly userBubbleDark: string = '#202020';
  static readonly userBubbleBorderDark: string = '#303030';
  static readonly composerBorderDark: string = '#383838';
  static readonly primaryDark: string = '#D8D8D8';
  static readonly secondaryDark: string = '#B4B4B0';
  static readonly mutedDark: string = '#82827E';
  static readonly linkDark: string = '#8FB5CF';
  static readonly borderDark: string = '#2B2B2B';
  static readonly dangerDark: string = '#E28D85';
  static readonly dangerBgDark: string = '#2D201F';
  static readonly terminalBgDark: string = '#0F1115';
  static readonly terminalFgDark: string = '#E8EAED';
  static readonly terminalBg: string = '#FFFFFF';
  static readonly terminalFg: string = '#171717';

  static canvas(useDark: boolean): string {
    return useDark ? HarnessColors.canvasDark : HarnessColors.canvas;
  }

  static surface(useDark: boolean): string {
    return useDark ? HarnessColors.surfaceDark : HarnessColors.surface;
  }

  static primaryText(useDark: boolean): string {
    return useDark ? HarnessColors.primaryDark : HarnessColors.primary;
  }

  static mutedText(useDark: boolean): string {
    return useDark ? HarnessColors.mutedDark : HarnessColors.muted;
  }

  static secondaryText(useDark: boolean): string {
    return useDark ? HarnessColors.secondaryDark : HarnessColors.secondary;
  }

  static linkText(useDark: boolean): string {
    return useDark ? HarnessColors.linkDark : HarnessColors.link;
  }

  static subtleBg(useDark: boolean): string {
    return useDark ? HarnessColors.subtleDark : HarnessColors.subtle;
  }

  static userBubbleBg(useDark: boolean): string {
    return useDark ? HarnessColors.userBubbleDark : HarnessColors.userBubble;
  }

  static userBubbleBorderColor(useDark: boolean): string {
    return useDark ? HarnessColors.userBubbleBorderDark : HarnessColors.userBubbleBorder;
  }

  static composerBorderColor(useDark: boolean): string {
    return useDark ? HarnessColors.composerBorderDark : HarnessColors.composerBorder;
  }

  static primaryForeground(useDark: boolean): string {
    return useDark ? '#101010' : '#FFFFFF';
  }

  static terminalBackground(useDark: boolean): string {
    return useDark ? HarnessColors.terminalBgDark : HarnessColors.terminalBg;
  }

  static terminalForeground(useDark: boolean): string {
    return useDark ? HarnessColors.terminalFgDark : HarnessColors.terminalFg;
  }

  static dangerText(useDark: boolean): string {
    return useDark ? HarnessColors.dangerDark : HarnessColors.danger;
  }

  static dangerBackground(useDark: boolean): string {
    return useDark ? HarnessColors.dangerBgDark : HarnessColors.dangerBg;
  }

  static borderColor(useDark: boolean): string {
    return useDark ? HarnessColors.borderDark : HarnessColors.border;
  }
}
