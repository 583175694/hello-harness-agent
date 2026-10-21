import { Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AuthService } from './auth.service';

@Controller('api/admin/users')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post(':userId/suspend')
  @HttpCode(204)
  suspend(@Param('userId') userId: string) {
    return this.auth.suspendUser(userId);
  }

  @Post(':userId/unsuspend')
  @HttpCode(204)
  unsuspend(@Param('userId') userId: string) {
    return this.auth.unsuspendUser(userId);
  }
}
