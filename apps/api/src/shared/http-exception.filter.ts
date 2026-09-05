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
  // 将 Nest 或供应商异常转换为共享的 Problem Details 结构。
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : this.isMulterLimitError(exception)
        ? 400
        : 500;
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
    if (this.isMulterLimitError(exception)) {
      return exception.code === 'LIMIT_FILE_SIZE'
        ? { code: 'FILE_TOO_LARGE', detail: '文件超过 20 MiB 限制。' }
        : { code: 'FILE_TOO_MANY', detail: '一次只能上传一个图片文件。' };
    }
    // 从 Nest 异常中提取可用的错误主体。
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { detail: response } : (response as ExceptionBody);
  }

  private isMulterLimitError(exception: unknown): exception is { code: string } {
    if (exception instanceof HttpException || typeof exception !== 'object' || !exception)
      return false;
    const value = exception as { code?: unknown; name?: unknown };
    return (
      value.name === 'MulterError' &&
      (value.code === 'LIMIT_FILE_SIZE' || value.code === 'LIMIT_UNEXPECTED_FILE')
    );
  }

  private readDetail(body: ExceptionBody, status: number): string {
    // 按优先级选择最终返回给客户端的错误详情。
    if (body.detail) return body.detail;
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (body.message) return body.message;
    return status === 500 ? 'An unexpected error occurred.' : 'The request could not be completed.';
  }
}
