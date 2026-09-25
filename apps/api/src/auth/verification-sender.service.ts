import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';
import type { VerificationChannel } from '@prisma/client';
import { ENV_KEYS } from '../bootstrap/env.constants';

export type SendVerificationInput = {
  channel: VerificationChannel;
  target: string;
  code: string;
};

@Injectable()
export class VerificationSenderService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  async send(input: SendVerificationInput): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    if (input.channel === 'email') {
      await this.sendEmail(input.target, input.code, nodeEnv);
      return;
    }
    await this.sendSms(input.target, input.code, nodeEnv);
  }

  private async sendEmail(target: string, code: string, nodeEnv: string): Promise<void> {
    const host = this.config.get<string>(ENV_KEYS.smtpHost);
    if (!host) {
      if (nodeEnv === 'production') throw new Error('SMTP 未配置，无法发送邮箱验证码。');
      this.logger.warn(`[dev-auth] 邮箱验证码 target=${target} code=${code}`);
      return;
    }
    // SMTP 生产发送可后续接入；当前非 production 仅打码。
    this.logger.log(`[email] target=${target}（SMTP_HOST 已配置，请接入发信实现）`);
    if (nodeEnv !== 'production') this.logger.warn(`[dev-auth] 邮箱验证码 code=${code}`);
  }

  private async sendSms(target: string, code: string, nodeEnv: string): Promise<void> {
    const secretId = this.config.get<string>(ENV_KEYS.tencentSmsSecretId);
    if (!secretId) {
      if (nodeEnv === 'production') throw new Error('腾讯云 SMS 未配置，无法发送短信验证码。');
      this.logger.warn(`[dev-auth] 短信验证码 target=${target} code=${code}`);
      return;
    }
    this.logger.warn(`[sms-stub] target=${target} code=${code}（请配置完整腾讯云 SMS 参数以真正发送）`);
  }
}
