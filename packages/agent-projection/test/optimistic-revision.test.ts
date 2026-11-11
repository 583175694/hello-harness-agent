import { describe, expect, it } from 'vitest';

import { optimisticRevisionAttachments } from '../src/optimistic-revision.js';

describe('optimisticRevisionAttachments', () => {
  it('returns explicit attachments when no revision context', () => {
    const explicit = [{ fileId: 'f1' }];
    expect(optimisticRevisionAttachments(explicit, undefined, undefined)).toBe(explicit);
  });
});
