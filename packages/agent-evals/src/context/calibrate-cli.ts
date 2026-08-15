import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrateContextJudge } from './calibration.js';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const outputIndex = args.indexOf('--output');
  const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!input) throw new Error('用法：--input <human-review.csv> [--output <calibration.json>]');
  const report = await calibrateContextJudge(
    resolve(input),
    outputIndex >= 0 && args[outputIndex + 1] ? resolve(args[outputIndex + 1]!) : undefined,
  );
  console.log(
    `Judge 校准完成 | labeled=${report.labeled} | agreement=${(report.agreement * 100).toFixed(1)}% | kappa=${report.cohenKappa.toFixed(3)} | calibrated=${report.calibrated}`,
  );
  if (!report.calibrated) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  void main().catch((error: unknown) => {
    console.error(`Judge 校准失败：${error instanceof Error ? error.message : '未知错误'}`);
    process.exitCode = 1;
  });
