import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';

export const RUN_TOOL_OUTPUT_KEY = (runId: string, toolCallId: string) =>
  `runs/${runId}/tools/${toolCallId}/output.json`;

export const RUN_SOURCE_CONTENT_KEY = (runId: string, sourceId: string) =>
  `runs/${runId}/sources/${sourceId}/content.json`;

export abstract class RunObjectStorage {
  canReadInline(): boolean {
    return false;
  }

  abstract putObject(input: {
    key: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string }>;

  abstract createReadUrl(input: { key: string; expiresSeconds?: number }): Promise<string>;

  abstract readObject(input: { key: string }): Promise<{ content: Buffer; contentType?: string }>;

  abstract deletePrefix(input: { prefix: string }): Promise<void>;
}

@Injectable()
export class LocalRunObjectStorage extends RunObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  override canReadInline(): boolean {
    return true;
  }

  async putObject(input: { key: string; content: Buffer; contentType: string }) {
    this.objects.set(input.key, input.content);
    return { objectKey: input.key };
  }

  async createReadUrl(input: { key: string }) {
    const match = /^runs\/([^/]+)\/tools\/([^/]+)\/output\.json$/u.exec(input.key);
    if (match?.[1] && match[2]) {
      return `/api/agent/runs/${match[1]}/tools/${encodeURIComponent(match[2])}/content`;
    }
    const sourceMatch = /^runs\/([^/]+)\/sources\/([^/]+)\/content\.json$/u.exec(input.key);
    if (sourceMatch?.[1] && sourceMatch[2]) {
      return `/api/agent/runs/${sourceMatch[1]}/sources/${encodeURIComponent(sourceMatch[2])}/content`;
    }
    throw new Error('LocalRunObjectStorageUnsupportedKey');
  }

  async readObject(input: { key: string }) {
    const content = this.objects.get(input.key);
    if (!content) throw new Error('LocalRunObjectNotFound');
    return { content };
  }

  async deletePrefix(input: { prefix: string }) {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(input.prefix)) this.objects.delete(key);
    }
  }
}

@Injectable()
export class CosRunObjectStorage extends RunObjectStorage {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.bucket = config.get<string>('COS_BUCKET') ?? '';
    this.region = config.get<string>('COS_REGION') ?? '';
    this.client = new COS({
      SecretId: config.get<string>('COS_SECRET_ID') ?? '',
      SecretKey: config.get<string>('COS_SECRET_KEY') ?? '',
    });
  }

  async putObject(input: { key: string; content: Buffer; contentType: string }) {
    await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: input.key,
      Body: input.content,
      ContentType: input.contentType,
    });
    return { objectKey: input.key };
  }

  async createReadUrl(input: { key: string; expiresSeconds?: number }) {
    return this.client.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: input.key,
      Sign: true,
      Expires: input.expiresSeconds ?? 300,
    });
  }

  async readObject(input: { key: string }) {
    const result = await this.client.getObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: input.key,
    });
    const body = result.Body;
    if (!body) throw new Error('CosRunObjectNotFound');
    return {
      content: Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array),
      contentType: result.headers?.['Content-Type'],
    };
  }

  async deletePrefix(input: { prefix: string }) {
    let marker: string | undefined;
    for (;;) {
      const listed = await this.client.getBucket({
        Bucket: this.bucket,
        Region: this.region,
        Prefix: input.prefix,
        Marker: marker,
        MaxKeys: 1000,
      });
      const contents = listed.Contents ?? [];
      if (!contents.length) break;
      await Promise.all(
        contents.map((item) =>
          item.Key
            ? this.client.deleteObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: item.Key,
              })
            : Promise.resolve(),
        ),
      );
      if (!listed.IsTruncated) break;
      marker = listed.NextMarker;
    }
  }
}
