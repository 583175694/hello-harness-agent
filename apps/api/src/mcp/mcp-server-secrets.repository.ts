import { Inject, Injectable } from '@nestjs/common';
import type { McpSecretKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SecretsCryptoService } from './secrets-crypto.service';

export type McpSecretPlain = { kind: McpSecretKind; name: string; value: string };

@Injectable()
export class McpServerSecretsRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SecretsCryptoService) private readonly crypto: SecretsCryptoService,
  ) {}

  secretsConfigured(secrets: Array<{ kind: McpSecretKind; name: string }>) {
    const headerNames: string[] = [];
    const envKeys: string[] = [];
    for (const secret of secrets) {
      if (secret.kind === 'env') envKeys.push(secret.name);
      else headerNames.push(secret.name);
    }
    return { headerNames, envKeys };
  }

  async replaceSecrets(configId: string, secrets: readonly McpSecretPlain[]): Promise<void> {
    if (!secrets.length) return;
    if (!this.crypto.canEncrypt()) throw new Error('SecretsMasterKeyMissing');
    await this.prisma.$transaction(async (tx) => {
      for (const secret of secrets) {
        const { ciphertext, nonce, keyVersion } = this.crypto.encrypt(secret.value);
        await tx.mcpServerSecret.upsert({
          where: {
            mcpServerConfigId_kind_name: {
              mcpServerConfigId: configId,
              kind: secret.kind,
              name: secret.name,
            },
          },
          create: {
            mcpServerConfigId: configId,
            kind: secret.kind,
            name: secret.name,
            ciphertext,
            nonce,
            keyVersion,
          },
          update: { ciphertext, nonce, keyVersion },
        });
      }
    });
  }

  async decryptAll(
    secrets: Array<{ kind: McpSecretKind; name: string; ciphertext: string; nonce: string }>,
  ): Promise<McpSecretPlain[]> {
    if (!secrets.length) return [];
    return secrets.map((row) => ({
      kind: row.kind,
      name: row.name,
      value: this.crypto.decrypt(row.ciphertext, row.nonce),
    }));
  }
}
