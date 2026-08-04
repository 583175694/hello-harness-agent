import { problemDetailsSchema } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import { createProblemDetailsFixture } from '../src/index.js';

describe('foundation fixtures', () => {
  it('creates a protocol-valid problem response', () => {
    expect(problemDetailsSchema.parse(createProblemDetailsFixture()).status).toBe(501);
  });
});
