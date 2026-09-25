import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_ERROR_CODES } from '@harness/agent-protocol';
import type { RequestUser } from './auth.types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (request.user?.role !== 'admin')
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.forbidden,
        detail: '需要管理员权限。',
      });
    return true;
  }
}
