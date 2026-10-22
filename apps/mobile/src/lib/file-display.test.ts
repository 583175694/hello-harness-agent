import { describe, expect, it } from 'vitest';
import { fileExtensionLabel, splitFileName } from './file-display';

describe('splitFileName', () => {
  it('keeps extension visible for long uuid names', () => {
    const name = '69512644-9F2E-4BF3-B35D-BD62F1F24041.md';
    expect(splitFileName(name)).toEqual({
      prefix: '69512644-9F2E-4BF3-B35D-BD62F1F24041',
      suffix: '.md',
    });
    expect(fileExtensionLabel(name)).toBe('MD');
  });
});
