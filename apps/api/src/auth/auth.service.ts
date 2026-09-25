import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User, VerificationChannel } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  AUTH_ERROR_CODES,
  type AuthUserView,
} from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { PrismaService } from '../database/prisma.service';
import { maskEmail, maskPhone, normalizeEmail, normalizePhone } from './auth.normalize';
import { ALIYUN_SMS_RATE_LIMIT_MARKER, AliyunSmsAuthService } from './aliyun-sms-auth.service';
import { VerificationSenderService } from './verification-sender.service';

const MAX_VERIFY_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(VerificationSenderService) private readonly sender: VerificationSenderService,
    @Inject(AliyunSmsAuthService) private readonly aliyunSms: AliyunSmsAuthService,
  ) {}

  async getUserById(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toUserView(user);
  }

  toUserView(user: User): AuthUserView {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email ? maskEmail(user.email) : null,
      phone: user.phone ? maskPhone(user.phone) : null,
      role: user.role,
      status: user.status,
    };
  }

  async sendEmailCode(rawEmail: string): Promise<void> {
    await this.sendCode('email', normalizeEmail(rawEmail));
  }

  async sendPhoneCode(rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    if (this.aliyunSms.isConfigured()) {
      await this.assertSendCodeRateLimit('phone', phone);
      await this.aliyunSms.sendVerifyCode(phone);
      await this.recordExternalSendRateLimit('phone', phone);
      return;
    }
    await this.sendCode('phone', phone);
  }

  private async sendCode(channel: VerificationChannel, target: string): Promise<void> {
    await this.assertSendCodeRateLimit(channel, target);

    const code = this.sender.generateCode();
    const ttl = this.config.get<number>(ENV_KEYS.authCodeTtlSeconds) ?? 600;
    await this.prisma.verificationCode.create({
      data: {
        channel,
        target,
        codeHash: this.sender.hashCode(code),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    await this.sender.send({ channel, target, code });
  }

  private async assertSendCodeRateLimit(channel: VerificationChannel, target: string): Promise<void> {
    const minInterval = this.config.get<number>(ENV_KEYS.authSendCodeMinIntervalSec) ?? 60;
    const latest = await this.prisma.verificationCode.findFirst({
      where: { channel, target, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < minInterval * 1000)
      throw new ConflictException({
        code: AUTH_ERROR_CODES.codeRateLimited,
        detail: `请 ${minInterval} 秒后再试。`,
      });
  }

  private async recordExternalSendRateLimit(
    channel: VerificationChannel,
    target: string,
  ): Promise<void> {
    const ttl = this.config.get<number>(ENV_KEYS.authCodeTtlSeconds) ?? 600;
    await this.prisma.verificationCode.create({
      data: {
        channel,
        target,
        codeHash: ALIYUN_SMS_RATE_LIMIT_MARKER,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
  }

  async verifyEmailLogin(rawEmail: string, code: string, userAgent?: string) {
    const email = normalizeEmail(rawEmail);
    return this.verifyAndLogin('email', email, code, userAgent, { email });
  }

  async verifyPhoneLogin(rawPhone: string, code: string, userAgent?: string) {
    const phone = normalizePhone(rawPhone);
    if (this.aliyunSms.isConfigured()) {
      await this.aliyunSms.checkVerifyCode(phone, code);
      return this.loginAfterIdentityVerified('phone', phone, userAgent, { phone });
    }
    return this.verifyAndLogin('phone', phone, code, userAgent, { phone });
  }

  async bindEmail(userId: string, rawEmail: string, code: string): Promise<AuthUserView> {
    const email = normalizeEmail(rawEmail);
    await this.consumeCode('email', email, code);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId)
      throw new ConflictException({
        code: AUTH_ERROR_CODES.identityAlreadyBound,
        detail: '该邮箱已被其他账号绑定。',
      });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerifiedAt: new Date() },
    });
    return this.toUserView(user);
  }

  async bindPhone(userId: string, rawPhone: string, code: string): Promise<AuthUserView> {
    const phone = normalizePhone(rawPhone);
    if (this.aliyunSms.isConfigured()) await this.aliyunSms.checkVerifyCode(phone, code);
    else await this.consumeCode('phone', phone, code);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.id !== userId)
      throw new ConflictException({
        code: AUTH_ERROR_CODES.identityAlreadyBound,
        detail: '该手机号已被其他账号绑定。',
      });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerifiedAt: new Date() },
    });
    return this.toUserView(user);
  }

  private async verifyAndLogin(
    channel: VerificationChannel,
    target: string,
    code: string,
    userAgent: string | undefined,
    identity: { email?: string; phone?: string },
  ): Promise<{ user: AuthUserView; token: string; expiresAt: Date }> {
    await this.consumeCode(channel, target, code);
    return this.loginAfterIdentityVerified(channel, target, userAgent, identity);
  }

  private async loginAfterIdentityVerified(
    channel: VerificationChannel,
    target: string,
    userAgent: string | undefined,
    identity: { email?: string; phone?: string },
  ): Promise<{ user: AuthUserView; token: string; expiresAt: Date }> {
    let user =
      channel === 'email'
        ? await this.prisma.user.findUnique({ where: { email: target } })
        : await this.prisma.user.findUnique({ where: { phone: target } });

    if (!user) {
      const displayName =
        channel === 'email' ? target.split('@')[0] ?? 'User' : `用户${target.slice(-4)}`;
      user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          kind: 'registered',
          displayName,
          role: 'user',
          status: 'active',
          ...(channel === 'email'
            ? { email: target, emailVerifiedAt: new Date() }
            : { phone: target, phoneVerifiedAt: new Date() }),
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastSeenAt: new Date(),
          ...(channel === 'email' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() }),
        },
      });
    }

    await this.applyBootstrapAdmin(user, identity);
    user = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (user.status === 'suspended')
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.authSuspended,
        detail: '账号已被停用。',
      });

    const session = await this.createLoginSession(user.id, userAgent);
    return { user: this.toUserView(user), token: session.token, expiresAt: session.expiresAt };
  }

  private async applyBootstrapAdmin(user: User, identity: { email?: string; phone?: string }) {
    const adminEmail = this.config.get<string>(ENV_KEYS.authBootstrapAdminEmail);
    const adminPhone = this.config.get<string>(ENV_KEYS.authBootstrapAdminPhone);
    const emailMatch = adminEmail && identity.email && normalizeEmail(adminEmail) === identity.email;
    const phoneMatch = adminPhone && identity.phone && normalizePhone(adminPhone) === identity.phone;
    if (emailMatch || phoneMatch) {
      await this.prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
    }
  }

  private async consumeCode(channel: VerificationChannel, target: string, code: string) {
    const row = await this.prisma.verificationCode.findFirst({
      where: { channel, target, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.invalidCode,
        detail: '验证码无效或已过期。',
      });
    if (row.attemptCount >= MAX_VERIFY_ATTEMPTS)
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.invalidCode,
        detail: '验证码尝试次数过多，请重新获取。',
      });
    const ok = row.codeHash === this.sender.hashCode(code);
    await this.prisma.verificationCode.update({
      where: { id: row.id },
      data: { attemptCount: row.attemptCount + 1, ...(ok ? { consumedAt: new Date() } : {}) },
    });
    if (!ok)
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.invalidCode,
        detail: '验证码错误。',
      });
  }

  async createLoginSession(userId: string, userAgent?: string) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const ttlDays = this.config.get<number>(ENV_KEYS.authSessionTtlDays) ?? 30;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const row = await this.prisma.userLoginSession.create({
      data: { userId, tokenHash, expiresAt, userAgent },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
    return { id: row.id, token, expiresAt };
  }

  async resolveSessionToken(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.userLoginSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session) return null;
    return {
      user: session.user,
      loginSessionId: session.id,
    };
  }

  async logout(loginSessionId: string | undefined): Promise<void> {
    if (!loginSessionId) return;
    await this.prisma.userLoginSession.updateMany({
      where: { id: loginSessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async suspendUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status: 'suspended' } }),
      this.prisma.userLoginSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async unsuspendUser(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { status: 'active' } });
  }

  getCookieName(): string {
    return this.config.get<string>(ENV_KEYS.authCookieName) ?? 'harness_session';
  }

  cookieOptions(expiresAt: Date, secure: boolean) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
      secure,
    };
  }
}
