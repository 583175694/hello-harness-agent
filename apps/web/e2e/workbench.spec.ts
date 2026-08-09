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
  await expect(page.getByRole('button', { name: '搜索网页，执行中' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '预览状态' })).toBeVisible();
});

test('opens and focuses the workbench from a conversation tool call', async ({ page }) => {
  await page.goto('/agent/preview?state=tool-running');
  await expect(page.getByRole('complementary', { name: '工作区' })).toHaveCount(0);
  await page.getByRole('button', { name: '搜索网页，执行中' }).click();
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.getByText('已固定')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: '工作区' }).getByText('中国生成式 AI 市场规模 增速 产业落地'),
  ).toBeVisible();
});

test('keeps preview chrome fixed while only conversation content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/agent/preview?state=tool-running');
  await expect(page.getByRole('button', { name: '搜索网页，执行中' })).toBeVisible();
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
  await expect(page.getByText('搜索供应商暂时不可用（503）', { exact: true })).toBeVisible();
});

test('renders final report fixture with the completed inline tool activity', async ({ page }) => {
  await page.goto('/agent/preview?state=final-report');
  await expect(page.getByText('中国与美国 AI 市场对比')).toBeVisible();
  await expect(page.getByRole('heading', { name: '来源列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '搜索网页，已完成' })).toBeVisible();
  await expect(page.getByText('找到 8 个结果')).toBeVisible();
});

test('keeps the layout usable at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/agent/preview?state=sources');
  await expect(page.getByRole('complementary', { name: '工作区' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
});

test('renders fetched sources without formal citation ids', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/agent/preview?state=fetch-candidate');
  await expect(page.getByText('已读取网页')).toBeVisible();
  await expect(page.getByText('F1')).toBeVisible();
  await expect(page.getByText('[F1]')).toHaveCount(0);
  await expect(page.getByText('[S1]')).toHaveCount(0);
  await page.getByText('查看 1 段原文').click();
  await expect(page.locator('.candidate-passage').getByText(/企业正在把生成式 AI/)).toBeVisible();
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth > document.body.clientWidth,
    workspace: (() => {
      const element = document.querySelector('.workspace-content');
      return element ? element.scrollWidth > element.clientWidth : true;
    })(),
  }));
  expect(overflow).toEqual({ body: false, workspace: false });
});
