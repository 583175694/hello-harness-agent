import { describe, expect, it } from 'vitest';

import { FakeSandboxProvider } from '../../../src/sandbox/fake-sandbox.provider';
import { SandboxJobService } from '../../../src/sandbox/sandbox-job.service';
import { SandboxManagerService } from '../../../src/sandbox/sandbox-manager.service';

describe('SandboxJobService', () => {
  it('starts a background job and lists it', async () => {
    const provider = new FakeSandboxProvider();
    const manager = new SandboxManagerService(provider, undefined);
    const jobs = new SandboxJobService(manager);
    const { jobId } = await jobs.startBackground({
      sessionId: 'session-a',
      runId: 'run-a',
      bash: { command: 'sleep:1', description: 'sleep test' },
      cwd: '/workspace',
      env: { HARNESS_SHELL: '1' },
    });
    expect(jobId).toBeTruthy();
    expect(manager.getRunningJobCount('session-a')).toBe(1);
  });

  it('killJob updates meta visible to listJobs after stale upload snapshot', async () => {
    const provider = new FakeSandboxProvider();
    const manager = new SandboxManagerService(provider, undefined);
    const jobs = new SandboxJobService(manager);
    const { jobId } = await jobs.startBackground({
      sessionId: 'session-b',
      runId: 'run-b',
      bash: { command: 'sleep:999', description: 'long sleep' },
      cwd: '/workspace',
      env: { HARNESS_SHELL: '1' },
    });
    await jobs.killJob('session-b', jobId);
    const listed = await jobs.listJobs('session-b');
    const meta = listed.find((job) => job.jobId === jobId);
    expect(meta?.status).toBe('killed');
    expect(manager.getRunningJobCount('session-b')).toBe(0);
  });
});
