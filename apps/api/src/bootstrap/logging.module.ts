import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

// 按运行环境生成日志配置：开发环境便于阅读，生产环境保留结构化 JSON。
export function createLoggingOptions(config: ConfigService): Params {
  const isDevelopment = config.get<string>('NODE_ENV') === 'development';

  return {
    pinoHttp: {
      level: config.get<string>('LOG_LEVEL', 'info'),
      autoLogging: false,
      quietReqLogger: true,
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname,req,res,responseTime,context',
              messageFormat: '[{context}] {msg}',
            },
          }
        : undefined,
      genReqId: (request, response) => {
        const requestId = request.headers['x-request-id'] ?? randomUUID();
        response.setHeader('x-request-id', requestId);
        return requestId;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.apiKey',
          'req.body.api_key',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createLoggingOptions,
    }),
  ],
})
export class LoggingModule {}
