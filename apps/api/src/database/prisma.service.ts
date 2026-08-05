import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Nest 启动完成后建立 Prisma 数据库连接。
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // 应用优雅退出时关闭 Prisma 数据库连接。
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
