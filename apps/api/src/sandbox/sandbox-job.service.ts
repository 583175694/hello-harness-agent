import { Injectable } from '@nestjs/common';
import type { BashInput } from '@harness/agent-protocol';
import { readSandboxRuntimeConfig, sandboxLimits } from './sandbox-config';
import { SandboxManagerService } from './sandbox-manager.service';
import { resolveWorkspacePath } from './sandbox-path';
import { SANDBOX_WORKSPACE_ROOT } from './sandbox-config';
import type { SandboxSession } from './sandbox.types';

export const SANDBOX_JOBS_DIR = `${SANDBOX_WORKSPACE_ROOT}/.harness/jobs`;

export type JobMeta = {
  jobId: string;
  command: string;
  description: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  exitCode?: number | null;
  completionReported?: boolean;
};

@Injectable()
export class SandboxJobService {
  private readonly outputCursors = new Map<string, number>();
  private readonly runningBySession = new Map<string, Set<string>>();

  constructor(private readonly manager: SandboxManagerService) {}

  async startBackground(input: {
    sessionId: string;
    runId: string;
    bash: BashInput;
    cwd: string;
    env: Record<string, string>;
    egressBoost?: boolean;
  }): Promise<{ jobId: string }> {
    const config = readSandboxRuntimeConfig();
    const running = this.runningBySession.get(input.sessionId) ?? new Set<string>();
    if (running.size >= config.jobMaxRunning) {
      throw new Error('SANDBOX_JOB_LIMIT');
    }
    const jobId = crypto.randomUUID();
    const jobDir = `${SANDBOX_JOBS_DIR}/${jobId}`;
    const meta: JobMeta = {
      jobId,
      command: input.bash.command,
      description: input.bash.description,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    const metaJson = JSON.stringify(meta);
    const exitFile = `${jobDir}/exit_code`;
    const metaFile = `${jobDir}/meta.json`;
    const pidFile = `${jobDir}/pid`;
    const completeMetaScript = [
      'import json',
      `p=${JSON.stringify(metaFile)}`,
      `ec=int(open(${JSON.stringify(exitFile)}).read().strip() or '1')`,
      'm=json.load(open(p))',
      "m['exitCode']=ec",
      "m['status']='completed' if ec==0 else 'failed'",
      "json.dump(m, open(p,'w'))",
    ].join('; ');
    const inner = [
      `echo $$ > ${JSON.stringify(pidFile)}`,
      `cd ${JSON.stringify(input.cwd)}`,
      input.bash.command,
      'ec=$?',
      `echo $ec > ${JSON.stringify(exitFile)}`,
      this.pythonOneLiner(completeMetaScript),
    ].join('; ');
    const startCommand = [
      `mkdir -p ${JSON.stringify(jobDir)}`,
      `printf '%s' ${JSON.stringify(metaJson)} > ${JSON.stringify(`${jobDir}/meta.json`)}`,
      // OpenSandbox 经 `bash -c` 执行时 `&;` 非法；且外层 $! 常为空，pid 由 inner 内 echo $$ 写入。
      `nohup bash -c ${JSON.stringify(inner)} >> ${JSON.stringify(`${jobDir}/stdout.log`)} 2>> ${JSON.stringify(`${jobDir}/stderr.log`)} &`,
    ].join('; ');
    await this.manager.withSession(input.sessionId, async (session) => {
      const started = await session.execute({
        command: startCommand,
        cwd: SANDBOX_WORKSPACE_ROOT,
        timeoutMs: sandboxLimits.commandDefaultMs,
        env: { ...input.env, HARNESS_SESSION_ID: input.sessionId },
        egressBoost: input.egressBoost,
      });
      if (started.exitCode !== 0 && started.exitCode !== null) {
        throw new Error(`SANDBOX_JOB_START_FAILED:${started.stderr || started.stdout}`);
      }
      await session.upload({
        path: `${jobDir}/meta.json`,
        data: Buffer.from(metaJson, 'utf8'),
      });
    });
    running.add(jobId);
    this.runningBySession.set(input.sessionId, running);
    this.manager.setRunningJobCount(input.sessionId, running.size);
    return { jobId };
  }

  async listJobs(sessionId: string): Promise<JobMeta[]> {
    return this.manager.withSession(sessionId, async (session) => {
      // Job 目录由容器内 bash mkdir 创建，OpenSandbox getFileInfo 常无法 stat 该目录；
      // 直接 ls 工作区文件系统（与 startBackground 写入路径一致）。
      const listing = await this.listJobIds(session, sessionId);
      const metas: JobMeta[] = [];
      for (const jobId of listing) {
        const meta = await this.readMeta(session, jobId);
        if (meta) metas.push(meta);
      }
      return metas;
    });
  }

  async readJobOutput(input: {
    sessionId: string;
    jobId: string;
    wait: boolean;
    timeoutMs: number;
  }): Promise<{ stdout: string; stderr: string; status: string; hadNewOutput: boolean; settled: boolean }> {
    const cursorKey = `${input.sessionId}:${input.jobId}`;
    const deadline = Date.now() + input.timeoutMs;
    let meta: JobMeta | undefined;
    let stdout = '';
    let stderr = '';
    let hadNewOutput = false;
    do {
      const chunk = await this.manager.withSession(input.sessionId, async (session) => {
        await this.assertJobOwned(session, input.jobId);
        meta = await this.readMeta(session, input.jobId);
        const offset = this.outputCursors.get(cursorKey) ?? 0;
        const outPath = `${SANDBOX_JOBS_DIR}/${input.jobId}/stdout.log`;
        const errPath = `${SANDBOX_JOBS_DIR}/${input.jobId}/stderr.log`;
        const outData = await this.readFromOffset(session, outPath, offset);
        const errData = await this.readFromOffset(session, errPath, 0);
        if (outData.read > 0) {
          this.outputCursors.set(cursorKey, offset + outData.read);
          hadNewOutput = true;
        }
        return { stdout: outData.text, stderr: errData.text, meta };
      });
      stdout = chunk.stdout;
      stderr = chunk.stderr;
      meta = chunk.meta;
      const settled = meta ? meta.status !== 'running' : false;
      if (settled || !input.wait) {
        return {
          stdout,
          stderr,
          status: meta?.status ?? 'unknown',
          hadNewOutput,
          settled,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    return {
      stdout,
      stderr,
      status: meta?.status ?? 'running',
      hadNewOutput,
      settled: false,
    };
  }

  async killJob(sessionId: string, jobId: string): Promise<{ status: string }> {
    return this.manager.withSession(sessionId, async (session) => {
      await this.assertJobOwned(session, jobId);
      const metaPath = `${SANDBOX_JOBS_DIR}/${jobId}/meta.json`;
      const killMetaScript = [
        'import json',
        `p=${JSON.stringify(metaPath)}`,
        'm=json.load(open(p))',
        "m['status']='killed'",
        "json.dump(m, open(p,'w'))",
      ].join('; ');
      const killCommand = [
        `pid=$(cat ${JSON.stringify(`${SANDBOX_JOBS_DIR}/${jobId}/pid`)} 2>/dev/null || true)`,
        'if [ -n "$pid" ]; then kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; fi',
        `sleep ${Math.ceil(sandboxLimits.jobKillGraceMs / 1000)}`,
        'if [ -n "$pid" ]; then kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; fi',
        this.pythonOneLiner(killMetaScript),
      ].join('; ');
      await session.execute({
        command: killCommand,
        cwd: SANDBOX_WORKSPACE_ROOT,
        timeoutMs: sandboxLimits.commandDefaultMs,
      });
      await this.syncMetaUpload(session, jobId);
      this.markCompletionReported(sessionId, jobId);
      this.decrementRunning(sessionId, jobId);
      return { status: 'killed' };
    });
  }

  markCompletionReported(sessionId: string, jobId: string): void {
    void this.manager.withSession(sessionId, async (session) => {
      const meta = await this.readMeta(session, jobId);
      if (!meta) return;
      meta.completionReported = true;
      await session.upload({
        path: `${SANDBOX_JOBS_DIR}/${jobId}/meta.json`,
        data: Buffer.from(JSON.stringify(meta), 'utf8'),
      });
    });
  }

  syncRunningCounts(sessionId: string): Promise<void> {
    return this.listJobs(sessionId).then((jobs) => {
      const running = jobs.filter((job) => job.status === 'running');
      const set = new Set(running.map((job) => job.jobId));
      this.runningBySession.set(sessionId, set);
      this.manager.setRunningJobCount(sessionId, set.size);
    });
  }

  private decrementRunning(sessionId: string, jobId: string): void {
    const set = this.runningBySession.get(sessionId);
    set?.delete(jobId);
    this.manager.setRunningJobCount(sessionId, set?.size ?? 0);
  }

  private async listJobIds(session: SandboxSession, sessionId: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const jobId of this.runningBySession.get(sessionId) ?? []) {
      ids.add(jobId);
    }
    try {
      const raw = await session.execute({
        command: `ls -1 ${SANDBOX_JOBS_DIR} 2>/dev/null || true`,
        cwd: SANDBOX_WORKSPACE_ROOT,
        timeoutMs: sandboxLimits.commandDefaultMs,
      });
      for (const line of raw.stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) ids.add(trimmed);
      }
    } catch {
      // 保留内存中已跟踪的 job id
    }
    return [...ids];
  }

  private async readMeta(session: SandboxSession, jobId: string): Promise<JobMeta | undefined> {
    const path = `${SANDBOX_JOBS_DIR}/${jobId}/meta.json`;
    const fromContainer = await this.readMetaFromContainer(session, path);
    if (fromContainer) return fromContainer;
    try {
      const data = await session.download({ path });
      return JSON.parse(Buffer.from(data).toString('utf8')) as JobMeta;
    } catch {
      return undefined;
    }
  }

  /** 容器内 meta 由 shell/python 更新时，Provider download 可能仍是 upload 快照。 */
  private async readMetaFromContainer(
    session: SandboxSession,
    path: string,
  ): Promise<JobMeta | undefined> {
    try {
      const raw = await session.execute({
        command: `cat ${JSON.stringify(path)} 2>/dev/null || true`,
        cwd: SANDBOX_WORKSPACE_ROOT,
        timeoutMs: sandboxLimits.commandMinMs,
      });
      const text = raw.stdout.trim();
      if (!text.startsWith('{')) return undefined;
      return JSON.parse(text) as JobMeta;
    } catch {
      return undefined;
    }
  }

  private pythonOneLiner(script: string): string {
    return `python3 -c ${JSON.stringify(script)}`;
  }

  private async syncMetaUpload(session: SandboxSession, jobId: string): Promise<void> {
    const path = `${SANDBOX_JOBS_DIR}/${jobId}/meta.json`;
    const meta = await this.readMetaFromContainer(session, path);
    if (!meta) return;
    await session.upload({
      path,
      data: Buffer.from(JSON.stringify(meta), 'utf8'),
    });
  }

  private async assertJobOwned(session: SandboxSession, jobId: string): Promise<void> {
    const meta = await this.readMeta(session, jobId);
    if (!meta) throw new Error('JOB_NOT_FOUND');
  }

  private async readFromOffset(
    session: SandboxSession,
    path: string,
    offset: number,
  ): Promise<{ text: string; read: number }> {
    const stat = await session.stat({ path });
    if (stat.kind !== 'regular_file' || stat.size === null) return { text: '', read: 0 };
    if (offset >= stat.size) return { text: '', read: 0 };
    const data = await session.download({ path });
    const slice = data.slice(offset);
    return { text: Buffer.from(slice).toString('utf8'), read: slice.byteLength };
  }
}
