import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { createLoggingOptions } from './logging.module';

describe('createLoggingOptions', () => {
  it('开发环境使用彩色单行日志并关闭自动访问日志', () => {
    const options = createLoggingOptions(
      new ConfigService({ NODE_ENV: 'development', LOG_LEVEL: 'debug' }),
    );

    expect(options).toEqual(
      expect.objectContaining({
        pinoHttp: expect.objectContaining({
          level: 'debug',
          autoLogging: false,
          quietReqLogger: true,
          transport: expect.objectContaining({ target: 'pino-pretty' }),
        }),
      }),
    );
  });

  it('生产环境保留结构化 JSON 日志', () => {
    const options = createLoggingOptions(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
    );

    expect(options).toEqual(
      expect.objectContaining({
        pinoHttp: expect.objectContaining({
          autoLogging: false,
          transport: undefined,
        }),
      }),
    );
  });
});
