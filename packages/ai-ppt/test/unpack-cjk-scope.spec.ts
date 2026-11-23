import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const unpackScript = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/ppt-unpack-check.py',
);

describe('ppt-unpack-check CJK scope', () => {
  it('only counts CJK inside .slide roots (--selftest)', () => {
    const stdout = execFileSync('python3', [unpackScript, '--selftest'], { encoding: 'utf8' });
    expect(JSON.parse(stdout)).toEqual({ selftest: 'ok' });
  });
});