import { describe, expect, it } from 'vitest';
import {
  buildMemoryDocumentText,
  composeMemoryRetrievalQuery,
  cosineSimilarity,
  deterministicEmbedding,
  toContextMemorySourceRefs,
} from '../../../src/memory/memory.utils';

describe('memory.utils', () => {
  it('builds document text from title and summary', () => {
    expect(buildMemoryDocumentText('姓名', '张三')).toBe('姓名\n张三');
  });

  it('composes retrieval query from recent user turns', () => {
    expect(composeMemoryRetrievalQuery('我叫什么', '请记住我叫李四')).toBe('我叫什么\n请记住我叫李四');
  });

  it('maps stored source refs to context shape', () => {
    expect(
      toContextMemorySourceRefs([
        {
          refType: 'message',
          refId: 'msg-1',
          userId: 'u1',
          sessionId: 's1',
          relation: 'source',
        },
      ]),
    ).toEqual([{ type: 'message', id: 'msg-1' }]);
  });

  it('produces stable deterministic embeddings in dev', () => {
    const first = deterministicEmbedding('hello', 8);
    const second = deterministicEmbedding('hello', 8);
    expect(first).toEqual(second);
    expect(first.length).toBe(8);
    expect(cosineSimilarity(first, second)).toBeCloseTo(1, 5);
  });
});
