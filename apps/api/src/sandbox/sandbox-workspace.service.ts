import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES, type ExecuteCommandInput } from '@harness/agent-protocol';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { FilesService } from '../files/files.service';
import { sandboxLimits } from './sandbox-config';
import { sandboxCollectFailed, sandboxStageFailed } from './sandbox-error';
import { assertWorkspaceFilePath } from './sandbox-path';
import type { SandboxSession } from './sandbox.types';

@Injectable()
export class SandboxWorkspaceService {
  constructor(
    private readonly files: FilesService,
    private readonly artifacts: ArtifactsService,
  ) {}

  async stage(
    sessionId: string,
    session: SandboxSession,
    inputFiles: NonNullable<ExecuteCommandInput['inputFiles']>,
  ): Promise<void> {
    if (inputFiles.length > sandboxLimits.stageMaxFiles) {
      throw sandboxStageFailed('输入文件数量超过上限。');
    }
    let total = 0;
    for (const item of inputFiles) {
      const path = assertWorkspaceFilePath(item.path);
      const file = await this.files.findReadyForSession(
        sessionId,
        item.fileId,
        AGENT_ERROR_CODES.fileNotFound,
      );
      const data = await this.files.readOriginalBytes(file.id);
      total += data.byteLength;
      if (total > sandboxLimits.stageMaxBytes) throw sandboxStageFailed('输入文件总大小超过上限。');
      const digest = createHash('sha256').update(data).digest('hex');
      const existing = await session.stat({ path });
      if (existing.kind === 'regular_file') {
        const current = await session.download({ path });
        const currentDigest = createHash('sha256').update(current).digest('hex');
        if (currentDigest === digest) continue;
        throw sandboxStageFailed('同路径已存在不同内容的文件。');
      }
      if (existing.kind !== 'missing') throw sandboxStageFailed('目标路径不是可写入文件。');
      await session.upload({ path, data });
    }
  }

  async collect(
    input: {
      sessionId: string;
      runId: string;
      toolCallId: string;
      session: SandboxSession;
      output: NonNullable<ExecuteCommandInput['output']>;
    },
  ) {
    const path = assertWorkspaceFilePath(input.output.path);
    const stat = await input.session.stat({ path });
    if (stat.kind !== 'regular_file') {
      throw sandboxCollectFailed('输出不是普通文件。', false);
    }
    if (stat.size !== null && stat.size > sandboxLimits.collectMaxBytes) {
      throw sandboxCollectFailed('输出文件超过 20 MiB。', false);
    }
    const data = await input.session.download({ path });
    if (data.byteLength > sandboxLimits.collectMaxBytes) {
      throw sandboxCollectFailed('输出文件超过 20 MiB。', false);
    }
    const fileName = input.output.fileName?.trim() || basename(input.output.path);
    return this.artifacts.importFromSandbox({
      sessionId: input.sessionId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      fileName,
      data,
    });
  }
}
