import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

/** M-CMP-12：服务端拒绝继续当前 Session 时禁用 Composer 并引导新建会话。 */
export function isSessionComposerBlockCode(code: string | undefined): boolean {
  return (
    code === 'MODEL_TRANSCRIPT_INCOMPATIBLE' ||
    code === AGENT_ERROR_CODES.modelTranscriptIntegrityError
  );
}

export type SessionComposerBlock = {
  code: string;
  detail: string;
};
