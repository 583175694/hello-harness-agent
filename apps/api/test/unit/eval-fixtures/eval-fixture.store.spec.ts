import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvalFixtureStore } from '../../../src/eval-fixtures/eval-fixture.store';

const workspace = join(__dirname, '../../../../..');
const fixtureRoot = join(workspace, 'packages/agent-evals/fixtures/context-v1');

describe('EvalFixtureStore', () => {
  it('loads immutable search and fetch results without network fallback', () => {
    const store = new EvalFixtureStore(
      new ConfigService({ NODE_ENV: 'test', EVAL_FIXTURE_ROOT: fixtureRoot }),
    );
    expect(store.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(store.search('  EVAL   CHAIN ALPHA ').results[0]?.url).toBe(
      'https://eval.invalid/chain-a91f',
    );
    expect(store.fetch({ urls: ['https://eval.invalid/number'] }).result).toMatchObject({
      stats: { succeededCount: 1, networkAttemptCount: 0 },
    });
    expect(store.fetch({ urls: ['https://eval.invalid/missing'] }).result).toMatchObject({
      stats: { failedCount: 1, networkAttemptCount: 0 },
    });
    const chainUrls = [
      'chain-a91f',
      'chain-7c42',
      'chain-f003',
      'chain-b18e',
      'chain-44d2',
      'chain-e6a1',
      'chain-90bf',
      'chain-c72d',
      'chain-15aa',
      'chain-d8e4',
    ];
    for (let index = 0; index < chainUrls.length; index += 1) {
      const result = store.fetch({
        urls: [`https://eval.invalid/${chainUrls[index]}`],
      }).result.results[0];
      expect(result?.status).toBe('succeeded');
      if (result?.status === 'succeeded')
        expect(result.passages[0]?.text).toContain(
          index === chainUrls.length - 1 ? 'CHAIN-4821' : chainUrls[index + 1],
        );
    }
  });

  it('rejects fixture activation outside NODE_ENV=test', () => {
    expect(
      () =>
        new EvalFixtureStore(
          new ConfigService({ NODE_ENV: 'production', EVAL_FIXTURE_ROOT: fixtureRoot }),
        ),
    ).toThrow('only allowed');
  });
});
