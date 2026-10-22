import { describe, expect, it } from 'vitest';
import {
  findInsertedSubstring,
  nextPastedTextFileName,
  resolveLongTextPaste,
} from './composer-paste';

describe('composer-paste', () => {
  it('allocates pasted-text file names without collision', () => {
    expect(nextPastedTextFileName([])).toBe('pasted-text.txt');
    expect(nextPastedTextFileName([{ fileName: 'pasted-text.txt' }])).toBe('pasted-text-2.txt');
    expect(
      nextPastedTextFileName([
        { fileName: 'pasted-text.txt' },
        { fileName: 'pasted-text-2.txt' },
      ]),
    ).toBe('pasted-text-3.txt');
  });

  it('detects append and selection replacement inserts', () => {
    expect(findInsertedSubstring('ab', 'abXYZ')).toBe('XYZ');
    expect(findInsertedSubstring('world', 'hello world')).toBe('hello ');
    expect(findInsertedSubstring('hello world', 'hello brave new world')).toBe('brave new ');
  });

  it('uploads inserts above the code point threshold', () => {
    const long = 'x'.repeat(4_001);
    const decision = resolveLongTextPaste({
      before: '',
      after: long,
      attachments: [],
      thresholdCodePoints: 4_000,
    });
    expect(decision.kind).toBe('upload-text');
    if (decision.kind === 'upload-text') {
      expect(decision.text).toBe(long);
      expect(decision.draft).toBe('');
      expect(decision.fileName).toBe('pasted-text.txt');
    }
  });

  it('keeps short pastes in the draft', () => {
    const decision = resolveLongTextPaste({
      before: 'hi',
      after: 'hi there',
      attachments: [],
      thresholdCodePoints: 4_000,
    });
    expect(decision).toEqual({ kind: 'keep', draft: 'hi there' });
  });
});
