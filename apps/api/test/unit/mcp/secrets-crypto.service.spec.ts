import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { SecretsCryptoService } from '../../../src/mcp/secrets-crypto.service';

describe('SecretsCryptoService', () => {
  it('round-trips plaintext with hex master key', () => {
    const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const crypto = new SecretsCryptoService(
      new ConfigService({ HARNESS_SECRETS_MASTER_KEY: key }),
    );
    const { ciphertext, nonce } = crypto.encrypt('my-token');
    expect(crypto.decrypt(ciphertext, nonce)).toBe('my-token');
  });

  it('reports cannot encrypt without master key', () => {
    const crypto = new SecretsCryptoService(new ConfigService({}));
    expect(crypto.canEncrypt()).toBe(false);
  });
});
