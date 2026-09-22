import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

export type EgressAuditDecision = 'allow' | 'deny';

@Injectable()
export class SandboxEgressAuditService {
  constructor(private readonly logger: Logger) {}

  record(input: {
    sessionId: string;
    runId?: string;
    toolCallId?: string;
    hosts: readonly string[];
    decision: EgressAuditDecision;
  }): void {
    this.logger.log(
      {
        type: 'sandbox_egress_audit',
        sessionId: input.sessionId,
        runId: input.runId,
        toolCallId: input.toolCallId,
        hosts: input.hosts,
        decision: input.decision,
      },
      SandboxEgressAuditService.name,
    );
  }
}
