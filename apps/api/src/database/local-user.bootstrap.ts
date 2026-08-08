import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from './prisma.service';

// 本地单用户模式的固定归属标识，所有 Session 与 Message 都绑定此用户。
export const LOCAL_USER_ID = 'local-user';

@Injectable()
export class LocalUserBootstrap implements OnModuleInit {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // 确保本地开发用户已经存在。
  async onModuleInit(): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: LOCAL_USER_ID },
      update: {},
      create: {
        id: LOCAL_USER_ID,
        kind: 'local',
        displayName: 'Local User',
      },
    });
  }
}
