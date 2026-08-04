import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ProblemDetails } from '@harness/agent-protocol';

type ExceptionBody = {
  code?: string;
  detail?: string;
  message?: string | string[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = this.readBody(exception);
    const title =
      status === 500 ? 'Internal server error' : (HttpStatus[status] ?? 'Request failed');

    const problem: ProblemDetails = {
      type: `https://hello-harness.local/problems/${body.code?.toLowerCase() ?? 'request-failed'}`,
      title,
      status,
      code: body.code ?? (status === 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`),
      detail: this.readDetail(body, status),
      instance: request.originalUrl,
    };

    response.status(status).type('application/problem+json').send(problem);
  }

  private readBody(exception: unknown): ExceptionBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { detail: response } : (response as ExceptionBody);
  }

  private readDetail(body: ExceptionBody, status: number): string {
    if (body.detail) return body.detail;
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (body.message) return body.message;
    return status === 500 ? 'An unexpected error occurred.' : 'The request could not be completed.';
  }
}
