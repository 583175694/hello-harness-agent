import { expect, test } from '@playwright/test';

const liveModelE2eEnabled = process.env.RUN_LIVE_MODEL_E2E === '1';

test.describe('live agent run', () => {
  test.skip(
    !liveModelE2eEnabled,
    'Set RUN_LIVE_MODEL_E2E=1 to run the real provider end-to-end test.',
  );

  test('answers a simple greeting through the real UI and SSE stream', async ({ page, request }) => {
    await page.goto('/agent');
    await page.getByRole('button', { name: '新建会话' }).click();
    await page.getByRole('textbox', { name: '任务输入' }).fill('你好');
    await page.getByRole('button', { name: '发送任务' }).click();

    await expect(page).toHaveURL(/\/agent\?session=/);
    await expect(page.locator('.message--assistant .assistant-text-block').last()).toContainText(
      /.+/,
      { timeout: 90_000 },
    );
    await expect(page.locator('.assistant-delivery-status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);

    const sessionId = new URL(page.url()).searchParams.get('session');
    expect(sessionId).toBeTruthy();
    await request.delete(`/api/agent/sessions/${sessionId}`);
  });
});
