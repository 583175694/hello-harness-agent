/** Gate A primitive：AppIcon（Phase A 用文字/emoji 占位）。 */
@Component
export struct AppIcon {
  @Prop glyph: string = '●';
  @Prop size: number = 20;

  build() {
    Text(this.glyph).fontSize(this.size)
  }
}
