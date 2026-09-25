import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { VerificationSenderService } from './verification-sender.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminController],
  providers: [
    AuthService,
    VerificationSenderService,
    AuthGuard,
    AdminGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
