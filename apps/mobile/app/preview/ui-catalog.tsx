import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { CatalogSection } from '@/features/agent/components/agent-elements/catalog-section';
import { ArtifactConversationCard } from '@/features/agent/components/agent-elements/artifact-conversation-card';
import { AssistantMessageBlock } from '@/features/agent/components/agent-elements/assistant-message-block';
import { FollowUpQueuePanel } from '@/features/agent/components/agent-elements/follow-up-queue-panel';
import { PlanFloatingCard } from '@/features/agent/components/agent-elements/plan-floating-card';
import { ReasoningBlock } from '@/features/agent/components/agent-elements/reasoning-block';
import { UserInterventionRow } from '@/features/agent/components/agent-elements/user-intervention-row';
import { UserMessageBubble } from '@/features/agent/components/agent-elements/user-message-bubble';
import { AgentChainOfThought } from '@/features/agent/components/agent-elements/agent-chain-of-thought';
import { SkillMentionChip } from '@/features/agent/components/agent-elements/skill-mention-chip';
import { ChatTopBar } from '@/features/agent/components/chat-top-bar';
import { ConnectionPill } from '@/features/agent/components/connection-pill';
import { ComposerPeekBar } from '@/features/agent/components/composer-peek-bar';
import { ServiceBanner } from '@/features/agent/components/service-banner';
import { ComposerClarificationPanel } from '@/features/agent/components/composer-clarification-panel';
import { ComposerHitlPanel } from '@/features/agent/components/composer-hitl-panel';
import { ComposerStack } from '@/features/agent/components/composer-stack';
import { ToolActivityRow } from '@/features/agent/components/tool-activity-row';
import { WorkbenchActivityView } from '@/features/agent/components/workbench-activity-view';
import { WorkbenchArtifactView } from '@/features/agent/components/workbench-artifact-view';
import { WorkbenchReportView } from '@/features/agent/components/workbench-report-view';
import { ACTIVITY_STATUS_COPY } from '@/features/agent/config/activity-status-copy';
import {
  catalogActivityStatuses,
  catalogArtifactBlock,
  catalogFollowUpFixture,
  catalogToolActivities,
  catalogToolStatusSamples,
} from '@/features/agent/fixtures/ui-catalog-fixtures';

export default function UiCatalogScreen() {
  const insets = useSafeAreaInsets();
  const [attachmentOpen, setAttachmentOpen] = useState(false);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerClassName="gap-8 px-4 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="headline">Agent UI 组件目录</Text>
          <Text variant="body-sm" className="mt-1 text-secondary">
            与 Web `/agent` 已落地能力静态对齐（含 Memory / Skills / memory_write）；Delegation / Host
            Git 无对应组件。
          </Text>
        </View>

        <CatalogSection title="壳层 · TopBar" description="会话标题 · 工作台图标 · 异常连接态">
          <ChatTopBar connectionState="live" />
          <View className="mt-2 overflow-hidden rounded-panel border border-border">
            <ChatTopBar runSummary="重连中…" connectionState="reconnecting" />
          </View>
        </CatalogSection>

        <CatalogSection title="壳层 · Connection / Service">
          <View className="flex-row flex-wrap gap-2">
            <ConnectionPill state="live" />
            <ConnectionPill state="reconnecting" />
            <ConnectionPill state="offline" />
          </View>
          <ServiceBanner state="unavailable" onRetry={() => undefined} />
        </CatalogSection>

        <CatalogSection title="用户消息" description="含 pendingState 与附件提示">
          <UserMessageBubble content="重构 auth_service 并补充 2FA 测试" />
          <UserMessageBubble content="改为先覆盖 jwt_handler" pendingState="steer_pending" />
          <UserMessageBubble content="已收到，从下一步应用" pendingState="steer_applied" />
          <UserMessageBubble
            content="Run 结束后请再导出报告"
            pendingState="follow_up_pending"
          />
          <UserMessageBubble content="带附件的用户消息" attachmentHint="requirements.md · 4 KB" />
          <UserMessageBubble
            content="用 Skill 润色 UI"
            skillNames={['better-ui']}
          />
        </CatalogSection>

        <CatalogSection title="Skills · mention chip">
          <View className="flex-row flex-wrap">
            <SkillMentionChip name="better-ui" mode="editable" onRemove={() => undefined} />
          </View>
        </CatalogSection>

        <CatalogSection title="Assistant · 交付态">
          <AssistantMessageBlock deliveryStatus="streaming" streaming>
            <Text variant="body-sm">流式输出中的正文块…</Text>
          </AssistantMessageBlock>
          <AssistantMessageBlock deliveryStatus="failed" errorDetail="模型超时">
            <Text variant="body-sm">（失败时仍保留已投影块）</Text>
          </AssistantMessageBlock>
          <AssistantMessageBlock deliveryStatus="cancelled">
            <Text variant="body-sm">（取消态）</Text>
          </AssistantMessageBlock>
        </CatalogSection>

        <CatalogSection title="Assistant · reasoning 块" description="无背景框，点按展开">
          <AssistantMessageBlock>
            <ReasoningBlock streaming content="先核对 Session 与 MFA pending token 边界…" />
            <ReasoningBlock content="已确认 pytest 夹具可 mock time.time()" durationMs={6800} />
          </AssistantMessageBlock>
        </CatalogSection>

        <CatalogSection title="Assistant · user_intervention">
          <UserInterventionRow content="补充：优先覆盖 refresh token 旋转路径" />
        </CatalogSection>

        <CatalogSection title="Assistant · Chain of Thought">
          <AgentChainOfThought running />
        </CatalogSection>

        <CatalogSection title="Assistant · artifact 块">
          <ArtifactConversationCard
            fileName={catalogArtifactBlock.fileName}
            versionNumber={catalogArtifactBlock.versionNumber}
            fileKind={catalogArtifactBlock.fileKind}
          />
        </CatalogSection>

        <CatalogSection
          title="tool_activity · 项目内工具"
          description="Registry / tool-copy 已注册工具名"
        >
          {catalogToolActivities.map((item) => (
            <ToolActivityRow key={item.id} item={item} />
          ))}
        </CatalogSection>

        <CatalogSection title="tool_activity · 状态">
          {catalogToolStatusSamples.map((item) => (
            <ToolActivityRow key={item.id} item={item} />
          ))}
        </CatalogSection>

        <CatalogSection title="Run · ActivityStatus（Workbench 标题语义）">
          {catalogActivityStatuses.map((key) => {
            const copy = ACTIVITY_STATUS_COPY[key];
            if (!copy) return null;
            return (
              <View key={key} className="rounded-control border border-composer-border bg-surface px-3 py-2">
                <Text variant="caption" className="font-mono text-muted">
                  {key}
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {copy.title}
                </Text>
                <Text variant="caption" className="text-secondary">
                  {copy.subtitle}
                </Text>
              </View>
            );
          })}
        </CatalogSection>

        <CatalogSection
          title="Composer · Plan 浮卡（非 Workbench Tab）"
          description="小 pill 浮在输入框上方，点击展开步骤"
        >
          <View className="relative pt-16">
            <View className="rounded-2xl border border-dashed border-composer-border bg-subtle/30 p-3">
              <Text variant="caption" className="text-center text-muted">
                Composer 占位
              </Text>
            </View>
            <View className="absolute bottom-full mb-2.5 w-full items-center">
              <PlanFloatingCard />
            </View>
          </View>
        </CatalogSection>

        <CatalogSection title="Composer · Follow-up Queue">
          <FollowUpQueuePanel items={catalogFollowUpFixture} />
        </CatalogSection>

        <CatalogSection title="Composer · peek 条">
          <ComposerPeekBar title="正在搜索公开来源" subtitle="步骤 2 / 5" onPress={() => undefined} />
        </CatalogSection>

        <CatalogSection title="Composer · 默认">
          <ComposerStack
            attachmentSheetOpen={attachmentOpen}
            onAttachmentSheetOpenChange={setAttachmentOpen}
          />
        </CatalogSection>

        <CatalogSection title="Composer · 附件预览条" description="showAttachmentSamples">
          <ComposerStack showAttachmentSamples />
        </CatalogSection>

        <CatalogSection title="HITL · clarification">
          <ComposerClarificationPanel />
        </CatalogSection>

        <CatalogSection title="HITL · tool_approval">
          <ComposerHitlPanel />
        </CatalogSection>

        <CatalogSection
          title="Workbench 视图"
          description="Sheet Tab：实时跟随 + 文件（动态）；来源列表并入实时跟随"
        >
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              实时跟随 · 工具 / 终端
            </Text>
            <View className="h-48">
              <WorkbenchActivityView emphasis="default" />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              实时跟随 · 来源卡片
            </Text>
            <View className="h-56">
              <WorkbenchActivityView emphasis="sources" />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              文件
            </Text>
            <View className="h-64">
              <WorkbenchArtifactView />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              报告预览（归入文件 Tab · Web 交付物）
            </Text>
            <WorkbenchReportView />
          </View>
        </CatalogSection>

        <CatalogSection title="Settings · 记忆 / MCP">
          <Link href="/settings/memory">
            <Text variant="body-sm" className="text-link">
              打开记忆设置（Hub / 列表 / 表单）
            </Text>
          </Link>
          <Link href="/settings/mcp">
            <Text variant="body-sm" className="mt-2 text-link">
              打开 MCP 列表与表单
            </Text>
          </Link>
        </CatalogSection>

        <CatalogSection title="Session Drawer" description="见 /preview/d-drawer 全屏帧">
          <Text variant="caption" className="text-muted">
            简化列表 + 底部设置；全屏交互请打开 Stitch 帧 D。
          </Text>
        </CatalogSection>

        <CatalogSection
          title="附件 Action Sheet"
          description="在「Composer · 默认」中点击 + 打开；此处不挂载 Modal 以免遮挡目录"
        >
          <View className="rounded-panel border border-dashed border-composer-border bg-subtle/50 px-3 py-4">
            <Text variant="body-sm" className="text-secondary">
              照片与图片 · 文件 · 取消
            </Text>
          </View>
        </CatalogSection>
      </ScrollView>
    </View>
  );
}
