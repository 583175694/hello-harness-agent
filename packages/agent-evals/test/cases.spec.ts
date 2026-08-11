import { describe, expect, it } from 'vitest';
import { RESEARCH_EVAL_CASES, selectCases } from '../src/cases.js';
import { researchEvalCaseSchema } from '../src/schemas.js';

describe('research eval cases', () => {
  it('contains six smoke and twenty-four full protocol-valid cases', () => {
    expect(selectCases('smoke')).toHaveLength(6);
    expect(selectCases('full')).toHaveLength(24);
    expect(
      RESEARCH_EVAL_CASES.every((item) => researchEvalCaseSchema.safeParse(item).success),
    ).toBe(true);
    expect(new Set(RESEARCH_EVAL_CASES.map((item) => item.id)).size).toBe(24);
  });

  it('keeps the required full-suite category distribution', () => {
    const counts = Object.fromEntries(
      [...new Set(RESEARCH_EVAL_CASES.map((item) => item.category))].map((category) => [
        category,
        selectCases('full').filter((item) => item.category === category).length,
      ]),
    );
    expect(counts).toEqual({
      direct_answer: 3,
      direct_url: 3,
      product_comparison: 4,
      current_research: 4,
      technical_troubleshooting: 4,
      policy_research: 3,
      travel_research: 2,
      limited_evidence: 1,
    });
  });

  it('allows selecting one full-only case without changing the default suite flag', () => {
    expect(selectCases('smoke', 'technical-dns-rebinding')).toHaveLength(1);
  });
});
