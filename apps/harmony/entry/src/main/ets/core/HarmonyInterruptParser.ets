import {
  ComposerClarificationLiveRow,
  ComposerToolApprovalItemLiveRow,
  ComposerToolApprovalLiveRow,
} from './HarmonyCoreTypes';

export interface PendingInterruptLive {
  clarification?: ComposerClarificationLiveRow;
  toolApproval?: ComposerToolApprovalLiveRow;
}

/** 对齐 packages/mobile-core InterruptPayloadParser。 */
export class HarmonyInterruptParser {
  static fromEventPayload(payload?: Record<string, Object>): PendingInterruptLive | undefined {
    if (payload === undefined) {
      return undefined;
    }
    const direct = payload['interrupt'] as Record<string, Object> | undefined;
    if (direct !== undefined) {
      return HarmonyInterruptParser.fromInterruptObject(direct);
    }
    const control = payload['control'] as Record<string, Object> | undefined;
    const active = control !== undefined ?
      control['activeInterrupt'] as Record<string, Object> | undefined :
      undefined;
    if (active === undefined) {
      return undefined;
    }
    return HarmonyInterruptParser.fromInterruptObject(active);
  }

  static fromInterruptObject(interrupt: Record<string, Object>): PendingInterruptLive | undefined {
    const status = `${interrupt['status'] ?? ''}`.trim();
    if (status !== 'pending') {
      return undefined;
    }
    const kind = `${interrupt['kind'] ?? ''}`.trim();
    if (kind === 'clarification') {
      const clarification = HarmonyInterruptParser.parseClarification(interrupt);
      return clarification !== undefined ? { clarification } : undefined;
    }
    if (kind === 'tool_approval') {
      const toolApproval = HarmonyInterruptParser.parseToolApproval(interrupt);
      return toolApproval !== undefined ? { toolApproval } : undefined;
    }
    return undefined;
  }

  private static parseClarification(interrupt: Record<string, Object>): ComposerClarificationLiveRow | undefined {
    const interruptId = `${interrupt['interruptId'] ?? ''}`.trim();
    if (interruptId.length === 0) {
      return undefined;
    }
    const payload = interrupt['payload'] as Record<string, Object> | undefined;
    if (payload === undefined) {
      return undefined;
    }
    const question = `${payload['question'] ?? ''}`.trim();
    if (question.length === 0) {
      return undefined;
    }
    const optionsRaw = payload['options'] as string[] | undefined;
    const options =
      optionsRaw !== undefined ?
        optionsRaw.map((o) => `${o}`.trim()).filter((o) => o.length > 0) :
        [];
    const allowFreeTextRaw = payload['allowFreeText'];
    const allowFreeText =
      allowFreeTextRaw === undefined ? true : `${allowFreeTextRaw}` === 'true';
    return { interruptId, question, options, allowFreeText };
  }

  private static parseToolApproval(interrupt: Record<string, Object>): ComposerToolApprovalLiveRow | undefined {
    const interruptId = `${interrupt['interruptId'] ?? ''}`.trim();
    if (interruptId.length === 0) {
      return undefined;
    }
    const payload = interrupt['payload'] as Record<string, Object> | undefined;
    const itemsRaw = payload !== undefined ? payload['items'] as Record<string, Object>[] | undefined : undefined;
    if (itemsRaw === undefined || itemsRaw.length === 0) {
      return undefined;
    }
    const items: ComposerToolApprovalItemLiveRow[] = [];
    for (const item of itemsRaw) {
      const itemId = `${item['itemId'] ?? ''}`.trim();
      const toolCallId = `${item['toolCallId'] ?? ''}`.trim();
      const toolName = `${item['toolName'] ?? ''}`.trim();
      const argumentsHash = `${item['argumentsHash'] ?? ''}`.trim();
      if (itemId.length === 0 || toolCallId.length === 0) {
        continue;
      }
      const input = item['input'];
      let command = '';
      if (typeof input === 'string') {
        command = input;
      } else if (input !== undefined && input !== null) {
        const obj = input as Record<string, Object>;
        command = `${obj['command'] ?? obj['fileName'] ?? JSON.stringify(obj)}`;
      }
      items.push({ itemId, toolName, command, toolCallId, argumentsHash });
    }
    if (items.length === 0) {
      return undefined;
    }
    return {
      interruptId,
      title: '需要批准工具调用',
      items,
      sandboxNote: undefined,
    };
  }
}
