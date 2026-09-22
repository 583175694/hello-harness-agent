import { describe, expect, it } from 'vitest';

import { buildEgressBoostRules, isHostAllowed, mergedEgressAllowlist } from '../../../src/sandbox/sandbox-config';

describe('sandbox egress boost rules', () => {
  it('builds dynamic allow rules when host allowlist is not enforced', () => {
    const rules = buildEgressBoostRules({
      commandHosts: ['zhihu.com'],
      config: {
        egressHostAllowlistEnforced: false,
        egressAllowlistExtra: [],
      },
    });
    expect(rules.some((r) => r.target === 'zhihu.com')).toBe(true);
    expect(rules.some((r) => r.target === '*.zhihu.com')).toBe(true);
  });

  it('uses merged allowlist when enforcement is on', () => {
    const rules = buildEgressBoostRules({
      commandHosts: ['zhihu.com'],
      config: {
        egressHostAllowlistEnforced: true,
        egressAllowlistExtra: ['zhihu.com'],
      },
    });
    const allowlist = mergedEgressAllowlist({
      egressAllowlistExtra: ['zhihu.com'],
    });
    expect(rules.map((r) => r.target).sort()).toEqual([...allowlist].sort());
    expect(isHostAllowed('zhihu.com', allowlist)).toBe(true);
    expect(isHostAllowed('evil.test', allowlist)).toBe(false);
  });
});
