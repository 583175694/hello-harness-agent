/** 与 Web `defaultThinkingMessage` / `reasoningLabel` 对齐（英文）。 */
export function reasoningTriggerLabel(streaming: boolean, durationMs?: number): string {
  if (streaming) return 'Thinking...';
  if (durationMs !== undefined) {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    return `Thought for ${seconds} seconds`;
  }
  return 'Thought';
}
