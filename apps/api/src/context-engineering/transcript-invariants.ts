import type { ModelMessage } from '../model/model-adapter';
import {
  assertCanonicalToolTranscript,
  ModelTranscriptIntegrityError,
} from '../model/model-transcript-integrity';

export const MODEL_TRANSCRIPT_INTEGRITY_ERROR = 'MODEL_TRANSCRIPT_INTEGRITY_ERROR';

export type TranscriptCheckResult =
  | { ok: true }
  | {
      ok: false;
      callId?: string;
      messageIndex?: number;
      detail: string;
    };

export function checkToolTranscript(messages: ModelMessage[]): TranscriptCheckResult {
  try {
    assertCanonicalToolTranscript(messages);
    return { ok: true };
  } catch (error) {
    if (error instanceof ModelTranscriptIntegrityError) {
      return {
        ok: false,
        callId: error.detail?.callId,
        messageIndex: error.detail?.messageIndex,
        detail: error.message,
      };
    }
    throw error;
  }
}

export function assertToolTranscriptOrThrow(messages: ModelMessage[]): void {
  const result = checkToolTranscript(messages);
  if (!result.ok) {
    throw new ModelTranscriptIntegrityError(result.detail, {
      callId: result.callId,
      messageIndex: result.messageIndex,
    });
  }
}

export class TranscriptCompileIntegrityError extends Error {
  constructor(
    message: string,
    readonly check: Exclude<TranscriptCheckResult, { ok: true }>,
    readonly step: string,
  ) {
    super(message);
    this.name = 'TranscriptCompileIntegrityError';
  }
}
