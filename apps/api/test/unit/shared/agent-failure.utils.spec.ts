import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

import { toAgentFailure } from '../../../src/shared/agent-failure.utils';

describe('toAgentFailure', () => {
  it('reads code and detail from Nest HttpException', () => {
    const error = new BadGatewayException({
      code: AGENT_ERROR_CODES.modelStreamInterrupted,
      detail: '模型响应流意外中断，本次回答未完成。',
    });
    expect(toAgentFailure(error)).toEqual({
      code: AGENT_ERROR_CODES.modelStreamInterrupted,
      detail: '模型响应流意外中断，本次回答未完成。',
    });
  });

  it('reads context budget errors from ServiceUnavailableException', () => {
    const error = new ServiceUnavailableException({
      code: AGENT_ERROR_CODES.contextBudgetExceeded,
      detail: '当前上下文超过模型预算，无法在保留必要内容后继续执行。',
    });
    expect(toAgentFailure(error)).toEqual({
      code: AGENT_ERROR_CODES.contextBudgetExceeded,
      detail: '当前上下文超过模型预算，无法在保留必要内容后继续执行。',
    });
  });

  it('maps ModelTranscriptIntegrityError to a stable code', () => {
    const error = new Error('Tool result without matching assistant tool call');
    error.name = 'ModelTranscriptIntegrityError';
    expect(toAgentFailure(error)).toEqual({
      code: AGENT_ERROR_CODES.modelTranscriptIntegrityError,
      detail:
        '对话过长后工具调用记录不完整，无法继续。请新建会话后重试，或缩短单次任务的调查范围。',
    });
  });

  it('falls back to generic stream failure for unknown errors', () => {
    expect(toAgentFailure(new Error('network reset'))).toEqual({
      code: 'MODEL_STREAM_FAILED',
      detail: '模型流式输出失败，请稍后重试。',
    });
  });
});
