import { Injectable } from '@nestjs/common';
import type { BashInput } from '@harness/agent-protocol';

export type BashPolicyClass = 'network' | 'install';

const NETWORK_PATTERNS: RegExp[] = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bgit\s+clone\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bnc\b|\bnetcat\b/i,
];

const INSTALL_PATTERNS: RegExp[] = [
  /\bpip3?\s+install\b/i,
  /\buv\s+pip\s+install\b/i,
  /\bpoetry\s+add\b/i,
  /\bnpm\s+install\b/i,
  /\bnpm\s+i\b/i,
  /\byarn\s+add\b/i,
  /\bpnpm\s+add\b/i,
  /\bapt(-get)?\s+install\b/i,
  /\bapk\s+add\b/i,
  /\bdnf\s+install\b/i,
  /\byum\s+install\b/i,
  /\bbrew\s+install\b/i,
];

const NPM_WORKSPACE = /^\s*npm\s+(run|test|ci)\b/i;

@Injectable()
export class BashCommandPolicyService {
  classify(input: Pick<BashInput, 'command'>): BashPolicyClass | null {
    const command = input.command.trim();
    if (/\bagent-browser\b/i.test(command) && /https?:\/\//i.test(command)) return 'network';
    if (NPM_WORKSPACE.test(command)) return null;
    if (/\bpip3?\s+install\b/i.test(command) && /\s-i\s+\S+/i.test(command)) return 'install';
    if (/\bnpm\s+install\b/i.test(command) && /\s--registry\s+\S+/i.test(command)) return 'install';
    if (INSTALL_PATTERNS.some((pattern) => pattern.test(command))) return 'install';
    if (NETWORK_PATTERNS.some((pattern) => pattern.test(command))) return 'network';
    return null;
  }

  policyLabel(policy: BashPolicyClass): string {
    return policy === 'network' ? '网络访问' : '安装依赖';
  }
}
