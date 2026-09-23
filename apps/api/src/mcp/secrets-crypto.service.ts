import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

export class SecretsMasterKeyMissingError extends Error {
  readonly code = AGENT_ERROR_CODES.secretsMasterKeyMissing;
  constructor() {
    super(AGENT_ERROR_CODES.secretsMasterKeyMissing);
  }
}

@Injectable()
export class SecretsCryptoService {
  private readonly key: Buffer | null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.key = parseMasterKey(this.config.get<string>('HARNESS_SECRETS_MASTER_KEY'));
  }

  canEncrypt(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): { ciphertext: string; nonce: string; keyVersion: number } {
    const key = this.requireKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([encrypted, tag]).toString('base64');
    return { ciphertext, nonce: nonce.toString('base64'), keyVersion: 1 };
  }

  decrypt(ciphertext: string, nonce: string): string {
    const key = this.requireKey();
    const nonceBuf = Buffer.from(nonce, 'base64');
    const data = Buffer.from(ciphertext, 'base64');
    if (data.length < 16) throw new Error('InvalidSecretCiphertext');
    const tag = data.subarray(data.length - 16);
    const encrypted = data.subarray(0, data.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, nonceBuf);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  fingerprintSecretValues(values: readonly string[]): string {
    const sorted = [...values].sort();
    return createHash('sha256').update(sorted.join('\0')).digest('hex');
  }

  private requireKey(): Buffer {
    if (!this.key) throw new SecretsMasterKeyMissingError();
    return this.key;
  }
}

function parseMasterKey(raw: string | undefined): Buffer | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    /* ignore */
  }
  return createHash('sha256').update(trimmed, 'utf8').digest();
}
