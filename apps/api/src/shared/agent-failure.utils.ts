import { HttpException } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

type AgentFailure = { code: string; detail: string };

type ExceptionBody = {
  code?: string;
  detail?: string;
  message?: string | string[];
};

/** Map runtime / Nest errors to stable client-facing { code, detail }. */
export function toAgentFailure(error: unknown): AgentFailure {
  if (error instanceof Error && error.message === 'MODEL_TRANSCRIPT_INCOMPATIBLE') {
    return {
      code: 'MODEL_TRANSCRIPT_INCOMPATIBLE',
      detail: '当前模型与该会话的推理上下文不兼容，请新建会话或恢复原模型。',
    };
  }
  if (
    error instanceof Error &&
    (error.name === 'ModelTranscriptIntegrityError' ||
      error.message === 'MODEL_TRANSCRIPT_INTEGRITY_ERROR')
  ) {
    return {
      code: AGENT_ERROR_CODES.modelTranscriptIntegrityError,
      detail:
        '对话过长后工具调用记录不完整，无法继续。请新建会话后重试，或缩短单次任务的调查范围。',
    };
  }
  if (error instanceof HttpException) {
    const body = readHttpExceptionBody(error);
    if (body.code && body.detail) return { code: body.code, detail: body.detail };
  }
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: unknown }).response;
    if (typeof response === 'object' && response !== null) {
      const value = response as { code?: unknown; detail?: unknown };
      if (typeof value.code === 'string' && typeof value.detail === 'string') {
        return { code: value.code, detail: value.detail };
      }
    }
  }
  return { code: 'MODEL_STREAM_FAILED', detail: '模型流式输出失败，请稍后重试。' };
}

function readHttpExceptionBody(exception: HttpException): ExceptionBody {
  const response = exception.getResponse();
  if (typeof response === 'string') return { detail: response };
  return response as ExceptionBody;
}
