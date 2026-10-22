import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';
import { isSessionComposerBlockCode } from './session-composer-block';

describe('session-composer-block', () => {
  it('recognizes transcript block error codes', () => {
    expect(isSessionComposerBlockCode('MODEL_TRANSCRIPT_INCOMPATIBLE')).toBe(true);
    expect(isSessionComposerBlockCode(AGENT_ERROR_CODES.modelTranscriptIntegrityError)).toBe(true);
    expect(isSessionComposerBlockCode('RUN_NOT_FOUND')).toBe(false);
  });
});
