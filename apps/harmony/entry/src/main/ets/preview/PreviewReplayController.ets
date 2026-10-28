import { ChatLine } from './PreviewModels';

/** 与 Android/iOS ReplayController 同语义：定时增长 assistant pending tail。 */
export class PreviewReplayController {
  private timerId: number = -1;
  private tailTarget: string = '';
  private endIndex: number = 0;
  private tickMs: number = 100;
  private step: number = 6;
  private lineIndex: number = -1;
  private onUpdate: (lines: ChatLine[]) => void = () => {
  };
  private workingLines: ChatLine[] = [];

  start(
    lines: ChatLine[],
    tailTarget: string,
    tickMs: number,
    codepointsPerTick: number,
    onUpdate: (lines: ChatLine[]) => void,
  ): void {
    this.stop();
    if (tailTarget.length === 0) {
      return;
    }
    this.workingLines = lines.slice();
    this.lineIndex = -1;
    for (let i = this.workingLines.length - 1; i >= 0; i--) {
      if (this.workingLines[i].role === 'assistant') {
        this.lineIndex = i;
        break;
      }
    }
    if (this.lineIndex < 0) {
      return;
    }
    this.tailTarget = tailTarget;
    this.endIndex = 0;
    this.tickMs = tickMs > 0 ? tickMs : 100;
    this.step = codepointsPerTick > 0 ? codepointsPerTick : 6;
    this.onUpdate = onUpdate;
    const prior = this.workingLines[this.lineIndex];
    this.workingLines[this.lineIndex] = {
      role: 'assistant',
      text: '',
      process: prior.process.slice(),
    };
    this.onUpdate(this.workingLines.slice());
    this.timerId = setInterval(() => {
      this.tick();
    }, this.tickMs);
  }

  private tick(): void {
    this.endIndex = Math.min(this.endIndex + this.step, this.tailTarget.length);
    const slice = this.tailTarget.substring(0, this.endIndex);
    const prior = this.workingLines[this.lineIndex];
    this.workingLines[this.lineIndex] = {
      role: 'assistant',
      text: slice,
      process: prior.process.slice(),
    };
    this.onUpdate(this.workingLines.slice());
    if (this.endIndex >= this.tailTarget.length) {
      this.stop();
    }
  }

  stop(): void {
    if (this.timerId >= 0) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }
}
