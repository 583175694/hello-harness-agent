import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AliyunSmsAuthService } from '../../../src/auth/aliyun-sms-auth.service';

const sendSmsVerifyCode = vi.fn();
const checkSmsVerifyCode = vi.fn();

vi.mock('@alicloud/dypnsapi20170525', () => ({
  default: class MockDypnsClient {
    sendSmsVerifyCode = sendSmsVerifyCode;
    checkSmsVerifyCode = checkSmsVerifyCode;
  },
  SendSmsVerifyCodeRequest: class SendSmsVerifyCodeRequest {
    constructor(public map: Record<string, unknown>) {}
  },
  CheckSmsVerifyCodeRequest: class CheckSmsVerifyCodeRequest {
    constructor(public map: Record<string, unknown>) {}
  },
}));

function createService(env: Record<string, string | number | undefined>) {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
  return new AliyunSmsAuthService(config, logger);
}

describe('AliyunSmsAuthService', () => {
  beforeEach(() => {
    sendSmsVerifyCode.mockReset();
    checkSmsVerifyCode.mockReset();
  });

  it('reports configured when all env keys are present', () => {
    const service = createService({
      ALIYUN_SMS_AUTH_ACCESS_KEY_ID: 'id',
      ALIYUN_SMS_AUTH_ACCESS_KEY_SECRET: 'secret',
      ALIYUN_SMS_AUTH_SIGN_NAME: '签名',
      ALIYUN_SMS_AUTH_TEMPLATE_CODE: '100001',
    });
    expect(service.isConfigured()).toBe(true);
  });

  it('sends verify code via OpenAPI when configured', async () => {
    sendSmsVerifyCode.mockResolvedValue({ body: { code: 'OK', success: true } });
    const service = createService({
      NODE_ENV: 'test',
      ALIYUN_SMS_AUTH_ACCESS_KEY_ID: 'id',
      ALIYUN_SMS_AUTH_ACCESS_KEY_SECRET: 'secret',
      ALIYUN_SMS_AUTH_SIGN_NAME: '签名',
      ALIYUN_SMS_AUTH_TEMPLATE_CODE: '100001',
      AUTH_SEND_CODE_MIN_INTERVAL_SEC: 60,
      AUTH_CODE_TTL_SECONDS: 600,
    });

    await service.sendVerifyCode('13800138000');

    expect(sendSmsVerifyCode).toHaveBeenCalledOnce();
    const request = sendSmsVerifyCode.mock.calls[0]?.[0] as { map: Record<string, unknown> };
    expect(request.map.phoneNumber).toBe('13800138000');
    expect(request.map.codeLength).toBe(6);
  });

  it('accepts PASS from CheckSmsVerifyCode', async () => {
    checkSmsVerifyCode.mockResolvedValue({
      body: { code: 'OK', success: true, model: { verifyResult: 'PASS' } },
    });
    const service = createService({
      NODE_ENV: 'test',
      ALIYUN_SMS_AUTH_ACCESS_KEY_ID: 'id',
      ALIYUN_SMS_AUTH_ACCESS_KEY_SECRET: 'secret',
      ALIYUN_SMS_AUTH_SIGN_NAME: '签名',
      ALIYUN_SMS_AUTH_TEMPLATE_CODE: '100001',
    });

    await expect(service.checkVerifyCode('13800138000', '123456')).resolves.toBeUndefined();
  });
});
