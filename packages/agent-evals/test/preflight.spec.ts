import { describe, expect, it } from 'vitest';
import { selectCases } from '../src/cases.js';
import { assertLocalResearchConfiguration } from '../src/preflight.js';

describe('assertLocalResearchConfiguration', () => {
  it('requires a model key for local evaluation', () => {
    expect(() =>
      assertLocalResearchConfiguration(
        'http://127.0.0.1:4318',
        selectCases('smoke', 'direct-event-loop'),
        {},
      ),
    ).toThrow('OPENAI_API_KEY');
  });

  it('requires the configured search provider key for research cases', () => {
    expect(() =>
      assertLocalResearchConfiguration('http://localhost:4318', selectCases('smoke'), {
        OPENAI_API_KEY: 'model-key',
        SEARCH_PROVIDER: 'bocha',
      }),
    ).toThrow('BOCHA_SEARCH_API_KEY');
  });

  it('accepts complete local config and does not inspect remote API credentials', () => {
    expect(() =>
      assertLocalResearchConfiguration('http://localhost:4318', selectCases('smoke'), {
        OPENAI_API_KEY: 'model-key',
        SEARCH_PROVIDER: 'serp',
        SERPER_SEARCH_API_KEY: 'search-key',
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalResearchConfiguration('https://eval-api.example', selectCases('smoke'), {}),
    ).not.toThrow();
  });
});
