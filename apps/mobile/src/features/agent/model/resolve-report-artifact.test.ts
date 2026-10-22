import { describe, expect, it } from 'vitest';

import type { SessionDetail } from '@harness/agent-protocol';

import { inferLatestReportArtifactId } from './resolve-report-artifact';

const baseSession = {
  id: 'session-1',
  title: 'Test',
  status: 'active' as const,
  isPinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  messages: [],
  artifactSeries: [],
  pendingUserInputs: [],
  activeRun: null,
};

describe('inferLatestReportArtifactId', () => {
  it('picks latest markdown artifact from series', () => {
    const session: SessionDetail = {
      ...baseSession,
      artifactSeries: [
        {
          seriesId: 'series-1',
          sessionId: 'session-1',
          logicalName: 'report.md',
          currentArtifactId: 'artifact-2',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          versions: [
            {
              artifactId: 'artifact-1',
              fileId: 'file-1',
              fileName: 'report.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 10,
              status: 'ready',
              createdAt: '2026-01-01T00:00:00.000Z',
              versionNumber: 1,
            },
            {
              artifactId: 'artifact-2',
              fileId: 'file-2',
              fileName: 'report.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 12,
              status: 'ready',
              createdAt: '2026-01-02T00:00:00.000Z',
              versionNumber: 2,
            },
          ],
        },
      ],
    };
    expect(inferLatestReportArtifactId(session)).toBe('artifact-2');
  });
});
