import { useEffect, useState } from 'react';

import type { ReportRef } from '@harness/agent-protocol';
import { loadReportAggregate } from '@/lib/artifact-actions';
import { useAgentHostSession } from './use-agent-host';

type WorkbenchReportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; report: ReportRef; markdown: string }
  | { status: 'error'; message: string };

export function useWorkbenchReport(reportId: string | null | undefined): WorkbenchReportState {
  const { client } = useAgentHostSession();
  const [state, setState] = useState<WorkbenchReportState>({ status: 'idle' });

  useEffect(() => {
    if (!reportId) {
      setState({ status: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    void loadReportAggregate(client, reportId, controller.signal)
      .then((aggregate) => {
        setState({
          status: 'ready',
          report: aggregate.report,
          markdown: aggregate.markdown,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '报告加载失败',
        });
      });
    return () => controller.abort();
  }, [client, reportId]);

  return state;
}
