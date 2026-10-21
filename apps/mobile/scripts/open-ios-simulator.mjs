#!/usr/bin/env node
/**
 * Expo Go 在模拟器里偶发无响应会导致 simctl openurl 超时 (NSPOSIX 60)。
 * 启动 / 重启 Expo Go，便于后续 exp:// 深链打开。
 */
import { execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const bundleId = 'host.exp.Exponent';

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch {
    // ignore — simulator may not be booted yet
  }
}

run(`xcrun simctl terminate booted ${bundleId}`);
await delay(1000);
try {
  const out = execSync(`xcrun simctl launch booted ${bundleId}`, { encoding: 'utf8' }).trim();
  if (out) {
    console.log(`[mobile] Expo Go: ${out}`);
  }
} catch (error) {
  console.warn('[mobile] 未检测到已启动的 iOS 模拟器，请先打开 Simulator。');
  process.exitCode = 1;
}
await delay(2000);
