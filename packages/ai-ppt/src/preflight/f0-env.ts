import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { FONT_FAMILY } from '../types.js';

const execFileAsync = promisify(execFile);

export type F0Result = {
  passed: boolean;
  code?: 'env_font_missing' | 'env_font_broken';
  message?: string;
  fonts: string[];
  nonBlankRatio?: number;
  fcMatches: Record<string, string>;
};

const REQUESTED_FAMILIES = ['Noto Sans SC', 'Microsoft YaHei'] as const;

async function fcMatch(family: string): Promise<string> {
  const { stdout } = await execFileAsync('fc-match', [family, ':lang=zh'], { encoding: 'utf8' });
  return stdout.split('\n')[0]?.split(',')[0]?.trim().replace(/^"|"$/g, '') ?? '';
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

function acceptMatch(requested: string, matched: string, zhFonts: string[]): boolean {
  if (requested === 'Noto Sans SC') {
    return matched.includes('Noto Sans SC') || matched.includes('Noto Sans CJK SC');
  }
  if (requested === 'Microsoft YaHei') {
    if (matched.includes('YaHei')) return true;
    if (zhFonts.length > 0) return true;
    return matched.includes('WenQuanYi') || matched.includes('Noto');
  }
  return matched.includes(requested);
}

async function rasterProbe(browser: Browser): Promise<number> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />
<style>body{margin:0;width:1280px;height:720px;font-family:${FONT_FAMILY};font-size:48px;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;}</style></head>
<body>中文测试：税务管理 0-9</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ratio = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1280, 720);
    const body = document.body;
    const style = getComputedStyle(body);
    ctx.fillStyle = style.color || '#111';
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(body.textContent ?? '', 640, 360);
    const data = ctx.getImageData(0, 0, 1280, 720).data;
    let dark = 0;
    const total = 1280 * 720;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 255;
      const g = data[i + 1] ?? 255;
      const b = data[i + 2] ?? 255;
      if (r < 250 || g < 250 || b < 250) dark += 1;
    }
    return dark / total;
  });
  await page.close();
  return ratio;
}

export async function runF0EnvProbe(options?: {
  browser?: Browser;
  skipRaster?: boolean;
}): Promise<F0Result> {
  const zhFonts = await fcListZh();
  const fcMatches: Record<string, string> = {};
  for (const family of REQUESTED_FAMILIES) {
    try {
      const matched = await fcMatch(family);
      fcMatches[family] = matched;
      if (!acceptMatch(family, matched, zhFonts)) {
        return {
          passed: false,
          code: 'env_font_missing',
          message: `fc-match failed for ${family}: got ${matched}`,
          fonts: zhFonts,
          fcMatches,
        };
      }
    } catch (error) {
      return {
        passed: false,
        code: 'env_font_missing',
        message: error instanceof Error ? error.message : 'fc-match unavailable',
        fonts: zhFonts,
        fcMatches,
      };
    }
  }

  if (zhFonts.length < 1) {
    return {
      passed: false,
      code: 'env_font_missing',
      message: 'fc-list :lang=zh returned no fonts',
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
    (await chromium.launch({
      headless: true,
      args: ['--font-render-hinting=none'],
    }));

  try {
    const ratio = await rasterProbe(browser);
    if (ratio < 0.005) {
      return {
        passed: false,
        code: 'env_font_broken',
        message: `CJK raster probe non-blank ratio ${ratio.toFixed(4)} < 0.5%`,
        fonts: zhFonts,
        fcMatches,
        nonBlankRatio: ratio,
      };
    }
    return { passed: true, fonts: zhFonts, fcMatches, nonBlankRatio: ratio };
  } finally {
    if (ownBrowser) await browser.close();
  }
}
