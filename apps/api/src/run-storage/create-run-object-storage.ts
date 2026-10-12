import { ConfigService } from '@nestjs/config';

import {
  CosRunObjectStorage,
  LocalRunObjectStorage,
  RunObjectStorage,
} from './run-object.storage';

export function createRunObjectStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RunObjectStorage {
  if (env.COS_BUCKET && env.COS_SECRET_ID && env.COS_SECRET_KEY) {
    const config = {
      get: <T = string>(key: string) => env[key] as T | undefined,
    } as ConfigService;
    return new CosRunObjectStorage(config);
  }
  return new LocalRunObjectStorage();
}
