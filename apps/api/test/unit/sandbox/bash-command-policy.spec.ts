import { describe, expect, it } from 'vitest';

import { BashCommandPolicyService } from '../../../src/sandbox/bash-command-policy.service';

describe('BashCommandPolicyService', () => {
  const policy = new BashCommandPolicyService();

  it('classifies workspace commands as auto', () => {
    expect(policy.classify({ command: 'echo ok' })).toBeNull();
    expect(policy.classify({ command: 'npm test' })).toBeNull();
    expect(policy.classify({ command: 'python script.py' })).toBeNull();
  });

  it('classifies network and install commands', () => {
    expect(policy.classify({ command: 'curl https://example.com' })).toBe('network');
    expect(policy.classify({ command: 'pip install requests' })).toBe('install');
    expect(policy.classify({ command: 'npm install lodash' })).toBe('install');
  });

  it('classifies agent-browser with URLs as network', () => {
    expect(
      policy.classify({ command: 'agent-browser open https://example.com' }),
    ).toBe('network');
    expect(policy.classify({ command: 'agent-browser snapshot' })).toBeNull();
    expect(
      policy.classify({ command: 'agent-browser screenshot /workspace/out.png' }),
    ).toBeNull();
  });
});
