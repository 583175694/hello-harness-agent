import { chromium, type Browser, type LaunchOptions } from 'playwright';

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
  const fromEnv =
    process.env.HARNESS_CHROMIUM_PATH?.trim() ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim();
  return fromEnv ? fromEnv : undefined;
}

export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  const executablePath = chromiumExecutablePath();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...options,
  });
}
