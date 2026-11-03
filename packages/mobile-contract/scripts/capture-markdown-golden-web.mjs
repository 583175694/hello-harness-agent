#!/usr/bin/env node
/**
 * 可选：用 Playwright 将 payloads 渲染为 Web PNG（390×844 视口内 Markdown 区域）。
 * 依赖：monorepo 内 playwright（如 apps/api）+ `playwright install chromium`
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const contractRoot = join(repoRoot, 'packages/mobile-contract');
const manifest = JSON.parse(
  readFileSync(join(contractRoot, 'fixtures/markdown-golden/manifest.json'), 'utf8'),
);
const outDir = join(contractRoot, 'fixtures/markdown-golden/web-baselines');
mkdirSync(outDir, { recursive: true });

const require = createRequire(join(repoRoot, 'apps/api/package.json'));
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright 未安装。请在仓库根目录执行: pnpm --filter @harness/api exec playwright install chromium');
  process.exit(1);
}

const htmlShell = (body) => `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="${pathToFileURL(join(repoRoot, 'apps/web/src/styles/markdown.css')).href}"/>
<style>
  body { margin: 0; background: #f7f7f6; font-family: system-ui, sans-serif; }
  .wrap { width: 390px; padding: 14px; box-sizing: border-box; }
</style>
</head><body><div class="wrap"><div class="markdown-content markdown-content--chat">${body}</div></div></body></html>`;

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

for (const scenario of manifest.scenarios) {
  const mdPath = join(contractRoot, scenario.payloadFile.replace(/^fixtures\//, 'fixtures/'));
  const md = readFileSync(mdPath, 'utf8');
  const escaped = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await page.setContent(htmlShell(`<pre style="white-space:pre-wrap;font:inherit">${escaped}</pre>`));
  const pngPath = join(outDir, `${scenario.id}.png`);
  await page.locator('.wrap').screenshot({ path: pngPath });
  console.log('Wrote', pngPath);
}

await browser.close();
console.log('\nNote: 上图为 plain pre 占位；完整 Streamdown 像素请用 Web 应用 + MarkdownContent 手工或 vitest DOM snapshot。');
