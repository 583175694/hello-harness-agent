import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  authBindEmailRequestSchema,
  authBindPhoneRequestSchema,
  authSendEmailCodeRequestSchema,
  authSendPhoneCodeRequestSchema,
  authVerifyEmailRequestSchema,
  authVerifyPhoneRequestSchema,
} from '@harness/agent-protocol';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import type { RequestUser } from './auth.types';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('email/send-code')
  @HttpCode(204)
  async sendEmailCode(@Body() body: unknown) {
    const parsed = authSendEmailCodeRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('邮箱格式无效。');
    await this.auth.sendEmailCode(parsed.data.email);
  }

  @Public()
  @Post('email/verify')
  async verifyEmail(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = authVerifyEmailRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('邮箱或验证码无效。');
    const result = await this.auth.verifyEmailLogin(
      parsed.data.email,
      parsed.data.code,
      req.headers['user-agent'],
    );
    this.setSessionCookie(res, result.token, result.expiresAt, req);
    return { user: result.user };
  }

  @Public()
  @Post('phone/send-code')
  @HttpCode(204)
  async sendPhoneCode(@Body() body: unknown) {
    const parsed = authSendPhoneCodeRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('手机号格式无效。');
    await this.auth.sendPhoneCode(parsed.data.phone);
  }

  @Public()
  @Post('phone/verify')
  async verifyPhone(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = authVerifyPhoneRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('手机号或验证码无效。');
    const result = await this.auth.verifyPhoneLogin(
      parsed.data.phone,
      parsed.data.code,
      req.headers['user-agent'],
    );
    this.setSessionCookie(res, result.token, result.expiresAt, req);
    return { user: result.user };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return { user: await this.auth.getUserById(user.id) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.loginSessionId);
    res.clearCookie(this.auth.getCookieName(), { path: '/' });
  }

  @Post('bind/email')
  async bindEmail(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = authBindEmailRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('邮箱或验证码无效。');
    const view = await this.auth.bindEmail(user.id, parsed.data.email, parsed.data.code);
    return { user: view };
  }

  @Post('bind/phone')
  async bindPhone(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = authBindPhoneRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid('手机号或验证码无效。');
    const view = await this.auth.bindPhone(user.id, parsed.data.phone, parsed.data.code);
    return { user: view };
  }

  private setSessionCookie(res: Response, token: string, expiresAt: Date, req: Request) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(this.auth.getCookieName(), token, this.auth.cookieOptions(expiresAt, secure));
  }

  private invalid(detail: string): never {
    throw new BadRequestException({ code: 'INVALID_AUTH_REQUEST', detail });
  }
}
