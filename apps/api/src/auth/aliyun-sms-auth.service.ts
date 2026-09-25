import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import Dypnsapi20170525, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { AUTH_ERROR_CODES } from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';

const DYPNS_ENDPOINT = 'dypnsapi.aliyuncs.com';
const VERIFY_CODE_LENGTH = 6;

@Injectable()
export class AliyunSmsAuthService {
  private client: Dypnsapi20170525 | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>(ENV_KEYS.aliyunSmsAuthAccessKeyId) &&
        this.config.get<string>(ENV_KEYS.aliyunSmsAuthAccessKeySecret) &&
        this.config.get<string>(ENV_KEYS.aliyunSmsAuthSignName) &&
        this.config.get<string>(ENV_KEYS.aliyunSmsAuthTemplateCode),
    );
  }

  async sendVerifyCode(phone: string): Promise<void> {
    if (!this.isConfigured()) {
      const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
      if (nodeEnv === 'production')
        throw new ServiceUnavailableException({
          code: 'ALIYUN_SMS_NOT_CONFIGURED',
          detail: '阿里云短信认证未配置，无法发送手机验证码。',
        });
      this.logger.warn(`[dev-auth] 阿里云短信未配置，跳过发送 phone=${phone}`);
      return;
    }

    const minInterval = this.config.get<number>(ENV_KEYS.authSendCodeMinIntervalSec) ?? 60;
    const validTime = this.config.get<number>(ENV_KEYS.authCodeTtlSeconds) ?? 600;
    const validMinutes = Math.max(1, Math.ceil(validTime / 60));
    const templateParam = JSON.stringify({ code: '##code##', min: String(validMinutes) });

    const request = new SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      countryCode: '86',
      signName: this.config.get<string>(ENV_KEYS.aliyunSmsAuthSignName),
      templateCode: this.config.get<string>(ENV_KEYS.aliyunSmsAuthTemplateCode),
      templateParam,
      codeType: 1,
      codeLength: VERIFY_CODE_LENGTH,
      validTime,
      interval: minInterval,
      duplicatePolicy: 1,
      autoRetry: 1,
    });

    const response = await this.invokeApi('发送短信验证码', () =>
      this.getClient().sendSmsVerifyCode(request),
    );
    const body = response.body;
    if (body?.code === 'OK' && body.success !== false) {
      this.logger.log(`[aliyun-sms] 验证码已发送 phone=${phone}`);
      return;
    }
    this.throwForApiFailure('发送短信验证码', body?.code, body?.message);
  }

  async checkVerifyCode(phone: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
      if (nodeEnv === 'production')
        throw new ServiceUnavailableException({
          code: 'ALIYUN_SMS_NOT_CONFIGURED',
          detail: '阿里云短信认证未配置，无法校验手机验证码。',
        });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.invalidCode,
        detail: '开发环境未配置阿里云短信，请配置凭据或使用邮箱登录。',
      });
    }

    const request = new CheckSmsVerifyCodeRequest({
      phoneNumber: phone,
      countryCode: '86',
      verifyCode: code,
      caseAuthPolicy: 1,
    });

    const response = await this.invokeApi('校验短信验证码', () =>
      this.getClient().checkSmsVerifyCode(request),
    );
    const body = response.body;
    if (body?.code !== 'OK' || body.success === false) {
      this.throwForVerifyFailure(body?.code, body?.message);
    }
    if (body?.model?.verifyResult === 'PASS') return;

    throw new UnauthorizedException({
      code: AUTH_ERROR_CODES.invalidCode,
      detail: '验证码错误或已过期。',
    });
  }

  private getClient(): Dypnsapi20170525 {
    if (this.client) return this.client;
    const config = new $OpenApiUtil.Config({
      accessKeyId: this.config.get<string>(ENV_KEYS.aliyunSmsAuthAccessKeyId),
      accessKeySecret: this.config.get<string>(ENV_KEYS.aliyunSmsAuthAccessKeySecret),
      endpoint: DYPNS_ENDPOINT,
    });
    this.client = new Dypnsapi20170525(config);
    return this.client;
  }

  private async invokeApi<T>(action: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[aliyun-sms] ${action}异常 message=${message}`);
      if (action.includes('校验') || this.looksLikeInvalidVerify(message)) {
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.invalidCode,
          detail: '验证码错误或已过期。',
        });
      }
      throw new ServiceUnavailableException({
        code: 'ALIYUN_SMS_FAILED',
        detail: `${action}失败，请稍后重试。`,
      });
    }
  }

  private throwForApiFailure(action: string, apiCode?: string, apiMessage?: string): never {
    const code = apiCode ?? 'UNKNOWN';
    const message = apiMessage ?? '未知错误';
    this.logger.warn(`[aliyun-sms] ${action}失败 code=${code} message=${message}`);

    if (this.isRateLimitCode(code, message)) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.codeRateLimited,
        detail: '发送过于频繁，请稍后再试。',
      });
    }

    throw new ServiceUnavailableException({
      code: 'ALIYUN_SMS_FAILED',
      detail: `${action}失败，请稍后重试。`,
    });
  }

  private throwForVerifyFailure(apiCode?: string, apiMessage?: string): never {
    const code = apiCode ?? 'UNKNOWN';
    const message = apiMessage ?? '未知错误';
    this.logger.warn(`[aliyun-sms] 校验短信验证码失败 code=${code} message=${message}`);

    if (this.isRateLimitCode(code, message)) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.codeRateLimited,
        detail: '验证过于频繁，请稍后再试。',
      });
    }

    throw new UnauthorizedException({
      code: AUTH_ERROR_CODES.invalidCode,
      detail: '验证码错误或已过期。',
    });
  }

  private looksLikeInvalidVerify(message: string): boolean {
    const haystack = message.toUpperCase();
    return (
      haystack.includes('VERIFY') ||
      haystack.includes('CODE') ||
      haystack.includes('验证码') ||
      haystack.includes('不匹配') ||
      haystack.includes('过期')
    );
  }

  private isRateLimitCode(apiCode: string, apiMessage: string): boolean {
    const haystack = `${apiCode} ${apiMessage}`.toUpperCase();
    return (
      haystack.includes('FREQUENCY') ||
      haystack.includes('LIMIT') ||
      haystack.includes('BUSINESS_LIMIT') ||
      haystack.includes('流控') ||
      haystack.includes('频繁')
    );
  }
}

/** 手机通道走阿里云验码时，本地表仅用于发码频控占位。 */
export const ALIYUN_SMS_RATE_LIMIT_MARKER = 'external:aliyun-sms-auth';
