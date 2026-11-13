import { accessSync, constants } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

/**
 * Linux browser binaries, in the same order dom-to-pptx/Puppeteer probes.
 *
 * Ubuntu 22.04's `chromium-browser` package is only a snap shim: the file can
 * exist while the real browser does not. Existence alone is therefore not
 * enough — see `isExecutable`.
 */
const LINUX_CHROMIUM_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/snap/bin/google-chrome',
] as const;

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveSystemChromiumPath(): string | undefined {
  if (process.platform !== 'linux') return undefined;
  return LINUX_CHROMIUM_CANDIDATES.find(isExecutable);
}

function explicitChromiumPath(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && isExecutable(value)) return value;
  }
  return undefined;
}

/** dom-to-pptx / Puppeteer 用；勿把 Playwright 自带 Chromium 塞给 Puppeteer。 */
export function puppeteerExecutablePath(): string | undefined {
  const explicit = explicitChromiumPath(
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.HARNESS_CHROMIUM_PATH,
  );
  // Playwright's Chromium lives under ms-playwright and ships without the
  // shared libs Puppeteer expects; reusing it tends to make Puppeteer fall
  // back to its own download.
  if (explicit && !explicit.includes('ms-playwright')) return explicit;
  return resolveSystemChromiumPath();
}

/**
 * Launch Chromium with an image-provided binary when one is configured.
 *
 * The sandbox image ships `/usr/bin/chromium` (and sets CHROME_PATH), while a
 * developer laptop usually relies on Playwright's own download. Honouring the
 * env var avoids a second ~150 MB browser download inside the sandbox and, more
 * importantly, guarantees preview/preflight/export all use the *same* binary
 * with the *same* font stack.
 */
export function chromiumExecutablePath(): string | undefined {
  const fromEnv = explicitChromiumPath(
    process.env.HARNESS_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
  );
  if (fromEnv) return fromEnv;
  const system = resolveSystemChromiumPath();
  if (system) return system;
  // Playwright's own Chromium is a fine fallback for preflight/measurement;
  // Puppeteer's separate download is the thing that fails under
  // ProtectHome=read-only.
  try {
    const fromPlaywright = chromium.executablePath();
    return fromPlaywright.length > 0 && isExecutable(fromPlaywright) ? fromPlaywright : undefined;
  } catch {
    return undefined;
  }
}

export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  const executablePath = chromiumExecutablePath();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...options,
  });
}
