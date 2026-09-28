import { describe, expect, it } from 'vitest';

import { buildEgressBoostRules, isHostAllowed, mergedEgressAllowlist } from '../../../src/sandbox/sandbox-config';

describe('sandbox egress boost rules', () => {
  it('builds dynamic allow rules from command hosts', () => {
    const rules = buildEgressBoostRules({
      commandHosts: ['zhihu.com'],
      config: { egressAllowlistExtra: [] },
    });
    expect(rules.some((r) => r.target === 'zhihu.com')).toBe(true);
    expect(rules.some((r) => r.target === '*.zhihu.com')).toBe(true);
  });

  it('resolves merged allowlist membership for host checks', () => {
    const allowlist = mergedEgressAllowlist({
      egressAllowlistExtra: ['zhihu.com'],
    });
    expect(isHostAllowed('zhihu.com', allowlist)).toBe(true);
    expect(isHostAllowed('evil.test', allowlist)).toBe(false);
  });
});
