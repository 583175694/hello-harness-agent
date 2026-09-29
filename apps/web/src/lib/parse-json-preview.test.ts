import { describe, expect, it } from 'vitest';

import { parseJsonPreviewText } from './parse-json-preview';

describe('parseJsonPreviewText', () => {
  it('parses JSON objects', () => {
    expect(parseJsonPreviewText('{"a":1}')).toEqual({ a: 1 });
  });

  it('wraps non-json text', () => {
    expect(parseJsonPreviewText('not json')).toEqual({ _unparsed: 'not json' });
  });
});
