import { catalogPlanFixture } from './ui-catalog-fixtures';
import type {
  MobileAssistantBlock,
  MobileChatFixture,
  MobilePreviewState,
} from './mobile-preview.types';
import {
  assistantIntroFixture,
  toolActivitiesFixture,
  userMessageFixture,
} from './ui-fixtures';
import type { ToolActivityFixture } from './ui-fixtures';

export const MOBILE_PREVIEW_STATES: Array<{ id: MobilePreviewState; label: string }> = [
  { id: 'empty', label: '空会话' },
  { id: 'direct-answer', label: '直接回答' },
  { id: 'tool-running', label: '检索中（已收起）' },
  { id: 'tool-running-open', label: '首次调用自动打开' },
  { id: 'plan-running', label: 'Plan 执行中' },
  { id: 'plan-completed', label: 'Plan 已完成' },
  { id: 'reasoning', label: '模型推理' },
  { id: 'artifacts', label: '生成文件' },
  { id: 'attachments', label: '文件附件' },
  { id: 'context-compacted', label: 'Context 已压缩' },
  { id: 'sources', label: '来源视图' },
  { id: 'fetch-running', label: '读取网页中' },
  { id: 'fetch-candidate', label: '已读网页' },
  { id: 'fetch-failed', label: '读取全部失败' },
  { id: 'waiting', label: '等待确认' },
  { id: 'clarification', label: '澄清问题' },
  { id: 'tool-approval', label: '工具审批' },
  { id: 'queued', label: '排队中' },
  { id: 'pause-requested', label: '即将暂停' },
  { id: 'paused', label: '已暂停' },
  { id: 'resuming', label: '恢复中' },
  { id: 'final-answer', label: '撰写回答' },
  { id: 'cancel-requested', label: '取消请求中' },
  { id: 'follow-up-pending', label: 'Follow-up 排队' },
  { id: 'steer-pending', label: 'Steer 待应用' },
  { id: 'steer-accepted', label: '已接受调整' },
  { id: 'cancelling', label: '取消中' },
  { id: 'cancelled', label: '已取消' },
  { id: 'failed', label: '执行失败' },
  { id: 'limited-report', label: '受限报告' },
  { id: 'final-report', label: '最终报告' },
];

function text(content: string): MobileAssistantBlock {
  return { type: 'text', content };
}

function runningSearchTool(): ToolActivityFixture {
  return {
    id: 'web-search-running',
    name: 'web_search',
    summary: '(中国生成式 AI 市场规模 增速 产业落地)',
    status: 'running',
    statusLabel: '执行中',
  };
}

function completedSearchTool(status: ToolActivityFixture['status'] = 'completed'): ToolActivityFixture {
  return {
    id: 'web-search-done',
    name: 'web_search',
    summary: '(找到 8 个结果)',
    status,
    duration: '44 秒',
    statusLabel: status === 'failed' ? '失败' : status === 'cancelled' ? '已取消' : undefined,
  };
}

function fetchTool(running: boolean, failed: boolean): ToolActivityFixture {
  return {
    id: 'web-fetch',
    name: 'web_fetch',
    summary: failed ? '(2 个网页 · 全部失败)' : running ? '(2 个网页 · 读取中)' : '(2 个网页 · 1 段原文)',
    status: running ? 'running' : failed ? 'failed' : 'completed',
    statusLabel: running ? '执行中' : failed ? '失败' : '已执行',
    duration: running ? undefined : '2.4 秒',
  };
}

/** 主会话 Stitch 帧：reasoning + 工具 + 产物 + Composer Plan */
export function defaultAuthRefactorFixture(): MobileChatFixture {
  return {
    title: 'agent-auth-refactor',
    conversation: [
      { kind: 'user', content: userMessageFixture },
      {
        kind: 'assistant',
        blocks: [
          {
            type: 'reasoning',
            content:
              '先核对 Session 与 MFA pending token 边界，再决定 pytest 里如何 mock time.time() 与 TOTP 窗口。',
            durationMs: 6800,
          },
          { type: 'text', content: assistantIntroFixture },
          ...toolActivitiesFixture.map((item) => ({ type: 'tool_activity' as const, item })),
          {
            type: 'text',
            content: '全部单元测试已就绪，工作台已生成 3 个相关产物。',
          },
          {
            type: 'artifact',
            fileName: 'test_auth_2fa.py',
            versionNumber: 2,
            fileKind: 'text',
          },
        ],
        showQuickActions: true,
      },
    ],
    composer: {
      showPlan: true,
      submitting: true,
    },
    workbench: { workbenchCount: 3 },
  };
}

function marketUserMessage() {
  return '请调研中国生成式 AI 市场趋势，重点关注产业落地。';
}

function marketBlocks(extra: MobileAssistantBlock[], toolStatus: ToolActivityFixture['status'] = 'running') {
  return [text('我先检索近期公开资料，再结合来源给出结论。'), { type: 'tool_activity' as const, item: completedSearchTool(toolStatus) }, ...extra];
}

function makeMarketFixture(
  state: MobilePreviewState,
  extra: MobileAssistantBlock[],
  composer: MobileChatFixture['composer'],
  workbench?: MobileChatFixture['workbench'],
): MobileChatFixture {
  const failed = state === 'failed';
  const cancelled = state === 'cancelled';
  const toolStatus = failed ? 'failed' : cancelled ? 'cancelled' : 'running';
  return {
    title: '中国 AI 市场调研',
    conversation: [
      { kind: 'user', content: marketUserMessage() },
      {
        kind: 'assistant',
        blocks: marketBlocks(extra, toolStatus),
        deliveryStatus: failed ? 'failed' : cancelled ? 'cancelled' : undefined,
        errorDetail: failed ? '搜索供应商暂时不可用（503）' : undefined,
      },
    ],
    composer,
    workbench,
  };
}

export function makeMobilePreviewState(state: MobilePreviewState | 'default'): MobileChatFixture {
  if (state === 'default') return defaultAuthRefactorFixture();

  if (state === 'empty') {
    return { conversation: [], composer: {} };
  }

  if (state === 'direct-answer') {
    return {
      title: 'AI 趋势概览',
      conversation: [
        { kind: 'user', content: '什么是生成式 AI？' },
        {
          kind: 'assistant',
          deliveryStatus: 'completed',
          blocks: [
            text(
              '生成式 AI 指能够根据提示生成文本、代码、图像等内容的模型系统。落地时仍需人工复核输出，并关注数据治理与访问控制。',
            ),
          ],
        },
      ],
      composer: {},
    };
  }

  if (state === 'reasoning') {
    return {
      title: '模型推理预览',
      conversation: [
        { kind: 'user', content: '比较两种方案，并说明最终建议。' },
        {
          kind: 'assistant',
          deliveryStatus: 'completed',
          blocks: [
            {
              type: 'reasoning',
              content:
                '先比较交付速度、维护成本与扩展空间。方案 A 上线更快，但方案 B 的长期维护成本更低，且更适合后续增加数据源。',
              durationMs: 8000,
            },
            text('建议选择方案 B：初期投入略高，但维护成本和扩展风险更可控。'),
          ],
        },
      ],
      composer: {},
    };
  }

  if (state === 'plan-running' || state === 'plan-completed') {
    const running = state === 'plan-running';
    return {
      title: 'Plan and Execute',
      conversation: [
        { kind: 'user', content: '请按计划完成一次多步骤资料整理。' },
        {
          kind: 'assistant',
          blocks: [
            text(running ? '我正在按计划收集资料并整理结果。' : '计划步骤已全部完成，下面是最终结果。'),
            { type: 'tool_activity', item: running ? runningSearchTool() : completedSearchTool('completed') },
          ],
          streaming: running,
        },
      ],
      composer: { showPlan: running, submitting: running },
      workbench: running ? { initialView: 'activity', initialSheetIndex: 1 } : undefined,
    };
  }

  if (state === 'artifacts') {
    return {
      title: '生成文件',
      conversation: [
        { kind: 'user', content: '输出报告、表格和执行摘要。' },
        {
          kind: 'assistant',
          deliveryStatus: 'completed',
          blocks: [
            text('报告、数据表和执行摘要已经生成，可分别预览或下载。'),
            { type: 'artifact', fileName: '市场调研报告.pdf', fileKind: 'pdf' },
            { type: 'artifact', fileName: '市场数据.xlsx', fileKind: 'xlsx' },
            { type: 'artifact', fileName: '执行摘要.docx', fileKind: 'docx' },
          ],
        },
      ],
      composer: {},
      workbench: { initialView: 'artifact', initialSheetIndex: 1, workbenchCount: 3 },
    };
  }

  if (state === 'attachments') {
    return {
      conversation: [
        {
          kind: 'user',
          content: '请结合草图和需求说明给出实现建议。',
          attachmentHint: 'wireframe.png · 需求说明.pdf',
        },
        {
          kind: 'assistant',
          deliveryStatus: 'completed',
          blocks: [text('已读取图片和 PDF，建议先统一信息层级，再补充交互状态说明。')],
        },
      ],
      composer: { showAttachmentSamples: true },
    };
  }

  if (state === 'context-compacted') {
    return {
      conversation: [
        { kind: 'user', content: '继续基于前面的长对话完成分析。' },
        {
          kind: 'assistant',
          streaming: true,
          blocks: [text('已压缩较早的对话内容，正在继续处理当前任务。')],
        },
      ],
      composer: { submitting: true },
      workbench: { initialView: 'context', initialSheetIndex: 1 },
    };
  }

  if (state === 'fetch-running' || state === 'fetch-candidate' || state === 'fetch-failed') {
    const running = state === 'fetch-running';
    const failed = state === 'fetch-failed';
    return {
      conversation: [
        { kind: 'user', content: '请查找生成式 AI 产业落地的原始依据。' },
        {
          kind: 'assistant',
          blocks: [{ type: 'tool_activity', item: fetchTool(running, failed) }],
          streaming: running,
        },
      ],
      composer: { submitting: running },
      workbench: {
        initialView: 'sources',
        initialSheetIndex: running ? 1 : -1,
      },
    };
  }

  if (state === 'clarification') {
    return makeMarketFixture(state, [text('检索材料跨度较大，请确认关注近 12 个月还是近 3 年。')], {
      mode: 'clarification',
      submitting: true,
    });
  }

  if (state === 'tool-approval') {
    return makeMarketFixture(state, [text('以下工具调用需要你确认后才会执行。')], {
      mode: 'hitl',
      submitting: true,
    });
  }

  if (state === 'follow-up-pending') {
    return makeMarketFixture(
      state,
      [text('当前任务继续执行，后续消息会在完成后按顺序启动。')],
      {
        showFollowUp: true,
        followUpItems: [
          { id: 'fu1', content: '再补充制造业案例。' },
          { id: 'fu2', content: '同时比较中美市场增速。' },
        ],
        submitting: true,
      },
    );
  }

  if (state === 'steer-pending') {
    return {
      conversation: [
        { kind: 'user', content: marketUserMessage() },
        {
          kind: 'user',
          content: '优先关注产业应用案例。',
          pendingState: 'steer_pending',
        },
        {
          kind: 'assistant',
          blocks: [
            text('方向调整已进入队列，将在下一安全步骤应用。'),
            { type: 'tool_activity', item: runningSearchTool() },
          ],
          streaming: true,
        },
      ],
      composer: { submitting: true },
    };
  }

  if (state === 'steer-accepted') {
    return makeMarketFixture(
      state,
      [
        { type: 'user_intervention', content: '优先关注产业应用案例。' },
        text('已接受调整，接下来会重点补充中国市场的产业应用案例。'),
      ],
      { submitting: true },
    );
  }

  if (state === 'tool-running') {
    return makeMarketFixture(
      state,
      [text('已获得第一批结果，正在交叉验证关键结论。')],
      { submitting: true },
      { initialSheetIndex: -1 },
    );
  }

  if (state === 'tool-running-open') {
    return makeMarketFixture(
      state,
      [text('已获得第一批结果，正在交叉验证关键结论。')],
      { submitting: true },
      { initialView: 'activity', initialSheetIndex: 1 },
    );
  }

  if (state === 'sources') {
    return makeMarketFixture(
      state,
      [text('已获得第一批结果，正在交叉验证关键结论。')],
      { submitting: true },
      { initialView: 'sources', initialSheetIndex: 1 },
    );
  }

  if (state === 'final-report' || state === 'limited-report') {
    return makeMarketFixture(
      state,
      [
        text(
          state === 'limited-report'
            ? '检索和复核已经完成。部分数字缺少可定位原文，暂不作为已确认结论。'
            : '检索和复核已经完成。美国在前沿模型和私人投资方面领先；中国在产业落地方面具备优势。',
        ),
      ],
      {},
      { initialView: 'report', initialSheetIndex: 1 },
    );
  }

  const statusCopy: Partial<Record<MobilePreviewState, string>> = {
    waiting: '检索材料跨度较大，请确认关注近 12 个月还是近 3 年。',
    queued: '任务已提交，正在等待执行资源。',
    'pause-requested': '已收到暂停请求，将在当前安全边界暂停。',
    paused: '任务已暂停，可从同一个运行边界继续。',
    resuming: '正在从暂停边界恢复任务。',
    'final-answer': '证据已整理完成，正在撰写最终回答。',
    'cancel-requested': '已收到取消请求，正在安全停止。',
    cancelling: '正在安全停止当前检索。',
    cancelled: '任务已取消，取消前的来源快照仍保留在工作台中。',
    failed: '搜索供应商暂时不可用，当前回答未能完成。',
  };

  const line = statusCopy[state];
  if (line) {
    return makeMarketFixture(state, [text(line)], { submitting: state !== 'cancelled' && state !== 'failed' });
  }

  return defaultAuthRefactorFixture();
}

export { catalogPlanFixture };
