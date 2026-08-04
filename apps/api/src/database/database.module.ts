import { Global, Module } from '@nestjs/common';

import { LocalUserBootstrap } from './local-user.bootstrap';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, LocalUserBootstrap],
  exports: [PrismaService],
})
export class DatabaseModule {}
