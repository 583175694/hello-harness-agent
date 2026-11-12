import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Browser } from 'playwright';
import { launchChromium } from './browser.js';
import { CJK_FONT_CANDIDATES, FONT_FAMILY } from '../types.js';

const execFileAsync = promisify(execFile);

export type F0Result = {
  passed: boolean;
  code?: 'env_font_missing' | 'env_font_broken';
  message?: string;
  fonts: string[];
  nonBlankRatio?: number;
  fcMatches: Record<string, string>;
};

async function fcMatch(family: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'fc-match',
    ['--format=%{family}', family],
    { encoding: 'utf8' },
  );
  return stdout.split('\n')[0]?.trim() ?? '';
}

async function fcListZh(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8' });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * `fc-list :lang=zh family` returns one line per font, and a line may list
 * localized aliases separated by commas. Build a flat alias set so we can ask
 * "did fc-match land on a font that actually covers Chinese?".
 */
function zhFamilyAliases(zhFonts: string[]): Set<string> {
  const aliases = new Set<string>();
  for (const line of zhFonts) {
    for (const part of line.split(',')) {
      const name = part.trim();
      if (name) aliases.add(name);
    }
  }
  return aliases;
}

function matchedIsCjk(matched: string, aliases: Set<string>): boolean {
  return matched
    .split(',')
    .map((part) => part.trim())
    .some((name) => name.length > 0 && aliases.has(name));
}

type RasterProbe = { nonBlankRatio: number };

/**
 * Pixel probe for "the environment can paint CJK at all".
 *
 * Note on what this can and cannot prove: on a machine with *any* system CJK
 * fallback, Chromium will silently substitute it, so a pixel/width probe cannot
 * tell "Noto installed" from "some other Han font installed". That check is
 * `fc-match` above (explicit family resolution), and it is the one that must
 * fail closed. This probe only catches a truly font-less image where even the
 * fallback is missing and every glyph renders as an empty/tofu box.
 */
async function rasterProbe(browser: Browser): Promise<RasterProbe> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />
<style>html,body{margin:0;width:1280px;height:720px;background:#fff;overflow:hidden}
.probe{width:1280px;height:720px;display:flex;align-items:center;justify-content:center;
  font-family:${FONT_FAMILY};font-size:48px;color:#111;font-weight:400;line-height:1.4}</style></head>
<body><div class="probe" id="probe">中文测试：税务管理 0-9</div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const buffer = await page.screenshot({ type: 'png' });
  await page.setContent(
    '<html><body style="margin:0"><canvas id="c" width="1280" height="720"></canvas></body></html>',
  );
  const nonBlankRatio = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.getElementById('c') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 255;
      const g = data[i + 1] ?? 255;
      const b = data[i + 2] ?? 255;
      if (r < 250 || g < 250 || b < 250) dark += 1;
    }
    return dark / (canvas.width * canvas.height);
  }, `data:image/png;base64,${buffer.toString('base64')}`);
  await page.close();
  return { nonBlankRatio };
}

export async function runF0EnvProbe(options?: {
  browser?: Browser;
  skipRaster?: boolean;
}): Promise<F0Result> {
  const zhFonts = await fcListZh();
  const aliases = zhFamilyAliases(zhFonts);
  const fcMatches: Record<string, string> = {};
  let matchedFamily: string | undefined;
  const attempts: string[] = [];

  // The CSS stack lists every acceptable family. Pass as soon as one of them
  // resolves to a real CJK font: the browser walks the same stack left to right.
  // Debian's fonts-noto-cjk only exposes "Noto Sans CJK SC", while Google Fonts
  // builds expose "Noto Sans SC" — accepting either keeps image and laptop aligned.
  for (const family of CJK_FONT_CANDIDATES) {
    let matched: string;
    try {
      matched = await fcMatch(family);
    } catch (error) {
      attempts.push(`${family}: ${error instanceof Error ? error.message : 'fc-match unavailable'}`);
      continue;
    }
    fcMatches[family] = matched;
    if (matched && matchedIsCjk(matched, aliases)) {
      matchedFamily = family;
      break;
    }
    attempts.push(`${family} -> ${matched || '(empty)'}`);
  }

  if (!matchedFamily) {
    if (zhFonts.length < 1) {
      return {
        passed: false,
        code: 'env_font_missing',
        message: 'fc-list :lang=zh returned no fonts',
        fonts: zhFonts,
        fcMatches,
      };
    }
    return {
      passed: false,
      code: 'env_font_missing',
      message: `no font in the deck stack resolves to a CJK family (${attempts.join('; ')})`,
      fonts: zhFonts,
      fcMatches,
    };
  }

  if (options?.skipRaster) {
    return { passed: true, fonts: zhFonts, fcMatches };
  }

  const ownBrowser = !options?.browser;
  const browser =
    options?.browser ??
    (await launchChromium({ args: ['--font-render-hinting=none'] }));

  try {
    const probe = await rasterProbe(browser);
    if (probe.nonBlankRatio < 0.005) {
      return {
        passed: false,
        code: 'env_font_broken',
        message: `CJK raster probe non-blank ratio ${probe.nonBlankRatio.toFixed(4)} < 0.5%`,
        fonts: zhFonts,
        fcMatches,
        nonBlankRatio: probe.nonBlankRatio,
      };
    }
    return { passed: true, fonts: zhFonts, fcMatches, nonBlankRatio: probe.nonBlankRatio };
  } finally {
    if (ownBrowser) await browser.close();
  }
}
