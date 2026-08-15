import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

// 128K token 上下文的 UTF-8 JSON 请求可能明显超过 Express 默认的 100KB。
export const API_REQUEST_BODY_LIMIT = '1mb';

export function configureHttpBodyParsing(app: INestApplication): void {
  app.use(json({ limit: API_REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: API_REQUEST_BODY_LIMIT }));
}
