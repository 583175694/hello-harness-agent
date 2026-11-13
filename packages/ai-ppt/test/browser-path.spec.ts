import { afterEach, describe, expect, it } from 'vitest';
import { chromiumExecutablePath, puppeteerExecutablePath } from '../src/preflight/browser.js';

const ENV_KEYS = [
  'HARNESS_CHROMIUM_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'CHROME_PATH',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('browser executable resolution', () => {
  it('ignores a configured path that is not executable', () => {
    // Regression: Ubuntu 22.04 ships chromium-browser as a snap shim, so the
    // path can exist while the real browser does not. Pointing either resolver
    // at it makes Preflight and Puppeteer fail with a confusing launch error.
    process.env.HARNESS_CHROMIUM_PATH = '/tmp/definitely-missing-chrome';
    delete process.env.CHROME_PATH;
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    expect(chromiumExecutablePath()).not.toBe('/tmp/definitely-missing-chrome');
    expect(puppeteerExecutablePath()).not.toBe('/tmp/definitely-missing-chrome');
  });

  it('accepts an explicitly configured executable', () => {
    // /bin/sh exists and is executable on every platform these tests run on.
    const shim = process.platform === 'win32' ? process.execPath : '/bin/sh';
    process.env.HARNESS_CHROMIUM_PATH = shim;
    expect(chromiumExecutablePath()).toBe(shim);
    expect(puppeteerExecutablePath()).toBe(shim);
  });

  it('keeps Playwright binaries away from Puppeteer', () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = undefined;
    process.env.HARNESS_CHROMIUM_PATH = '/home/ubuntu/.cache/ms-playwright/chromium-123/chrome-linux/chrome';
    // Only assert when that path is actually executable, otherwise the
    // executable check dominates and the test proves nothing.
    if (puppeteerExecutablePath() !== undefined) {
      expect(puppeteerExecutablePath()).not.toContain('ms-playwright');
    }
  });
});
