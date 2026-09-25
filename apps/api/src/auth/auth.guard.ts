import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_ERROR_CODES } from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { RequestUser } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const authMode = this.config.get<string>(ENV_KEYS.authMode) ?? 'local';
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    if (authMode === 'local') {
      request.user = { id: LOCAL_USER_ID, role: 'user', status: 'active' };
      return true;
    }

    const cookieName = this.auth.getCookieName();
    const token = request.cookies?.[cookieName] as string | undefined;
    if (!token)
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.authRequired,
        detail: '请先登录。',
      });

    const resolved = await this.auth.resolveSessionToken(token);
    if (!resolved)
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.authRequired,
        detail: '登录已失效，请重新登录。',
      });

    if (resolved.user.status === 'suspended')
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.authSuspended,
        detail: '账号已被停用。',
      });

    request.user = {
      id: resolved.user.id,
      role: resolved.user.role,
      status: resolved.user.status,
      loginSessionId: resolved.loginSessionId,
    };
    return true;
  }
}
