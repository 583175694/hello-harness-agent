import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/http-exception.filter';

// 创建 API 应用，配置全局中间件并启动服务。
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    autoFlushLogs: false,
  });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: false,
  });
  app.enableShutdownHooks();

  const host = config.getOrThrow<string>('API_HOST');
  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port, host);
  logger.log(`API 服务已启动 | 地址=http://${host}:${port}`, 'Bootstrap');
}

void bootstrap();
