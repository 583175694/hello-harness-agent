import { Controller, HttpCode, Post } from '@nestjs/common';

import type { ProblemDetails } from '@harness/agent-protocol';

@Controller('api/agent/sessions')
export class SessionsController {
  @Post()
  @HttpCode(501)
  create(): ProblemDetails {
    return {
      type: 'https://hello-harness.local/problems/not-implemented',
      title: 'Capability unavailable',
      status: 501,
      code: 'CAPABILITY_NOT_IMPLEMENTED',
      detail: 'Task sessions will be enabled in the next implementation phase.',
    };
  }
}
