import { describe, expect, it } from 'vitest';

import {
  compressAssistantMetadata,
  isFatAssistantMetadata,
  metadataUtf8Bytes,
} from '../../../src/run-storage/metadata-migration.utils';

describe('metadata migration utils', () => {
  it('detects fat metadata by embedded executions', () => {
    expect(
      isFatAssistantMetadata({
        agent: { executions: [{ toolCallId: 'call-1' }] },
      }),
    ).toBe(true);
  });

  it('compresses metadata to lightweight agent fields', () => {
    const compressed = compressAssistantMetadata({
      metadata: {
        model: 'demo',
        deliveryStatus: 'completed',
        runId: 'run-1',
        blocks: [{ type: 'text', id: 'b1', content: 'hello' }],
        agent: {
          toolCallCount: 2,
          detailRef: 'run-1',
          executions: [{ toolCallId: 'call-1' }],
        },
      },
      runId: 'run-1',
      messageId: 'message-1',
    });
    expect(compressed).toEqual({
      model: 'demo',
      deliveryStatus: 'completed',
      runId: 'run-1',
      agent: { toolCallCount: 2, detailRef: 'run-1' },
    });
    expect(metadataUtf8Bytes(compressed as never)).toBeLessThan(256);
  });
});
