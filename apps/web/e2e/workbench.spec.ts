import { expect, test } from '@playwright/test';

test('opens the bright production conversation shell without an empty workbench', async ({
  page,
}) => {
  await page.goto('/agent');
  await expect(page.locator('.brand-row').getByText('Harness', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '工作区' })).toHaveCount(0);
});

test('renders the running search fixture and workbench sources', async ({ page }) => {
  await page.goto('/agent/preview?state=tool-running-open');
  await expect(page.getByText('正在执行网页检索')).toBeVisible();
  await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
  await expect(page.getByText('作为调整提交 · 下一步骤生效')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '预览状态' })).toBeVisible();
});

test('opens and focuses the workbench from a conversation tool call', async ({ page }) => {
  await page.goto('/agent/preview?state=tool-running');
  await expect(page.getByRole('complementary', { name: '工作区' })).toHaveCount(0);
  await page.getByRole('button', { name: /检索市场趋势/ }).click();
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.getByText('已固定')).toBeVisible();
  await expect(page.getByText('中国生成式 AI 市场趋势 2025')).toBeVisible();
});

test('keeps preview chrome fixed while only conversation content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/agent/preview?state=tool-running');
  await expect(page.getByRole('button', { name: /检索市场趋势/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    conversationScrollHeight: document.querySelector('.conversation-scroll')?.scrollHeight ?? 0,
    conversationClientHeight: document.querySelector('.conversation-scroll')?.clientHeight ?? 0,
  }));

  expect(dimensions.bodyScrollWidth).toBe(dimensions.viewportWidth);
  expect(dimensions.bodyScrollHeight).toBe(dimensions.viewportHeight);
  expect(dimensions.conversationScrollHeight).toBeGreaterThanOrEqual(
    dimensions.conversationClientHeight,
  );

  const composerPlacement = await page.evaluate(() => {
    const composer = document.querySelector('.composer')?.getBoundingClientRect();
    const switcher = document.querySelector('.preview-switcher')?.getBoundingClientRect();
    return { composerBottom: composer?.bottom ?? 0, switcherTop: switcher?.top ?? 0 };
  });
  expect(composerPlacement.composerBottom).toBeLessThan(composerPlacement.switcherTop);
});

test('renders waiting and failed mock states from the preview switcher', async ({ page }) => {
  await page.goto('/agent/preview?state=waiting');
  await expect(page.getByText('等待你的确认')).toBeVisible();
  await page
    .getByRole('navigation', { name: '预览状态' })
    .getByRole('link', { name: '执行失败' })
    .click();
  await expect(
    page.getByRole('complementary', { name: '工作区' }).getByText('执行失败', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('搜索供应商暂时不可用', { exact: true })).toBeVisible();
});

test('renders final report fixture and collapsible run summary', async ({ page }) => {
  await page.goto('/agent/preview?state=final-report');
  await expect(page.getByText('中国与美国 AI 市场对比')).toBeVisible();
  await expect(page.getByRole('heading', { name: '来源列表' })).toBeVisible();
  await expect(page.getByText('完成 5 次检索，引用 8 个来源，用时 3 分 42 秒')).toBeVisible();
});

test('keeps the layout usable at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/agent/preview?state=sources');
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
});
