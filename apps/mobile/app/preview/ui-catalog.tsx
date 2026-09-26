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
import { ChatTopBar } from '@/features/agent/components/chat-top-bar';
import { ComposerClarificationPanel } from '@/features/agent/components/composer-clarification-panel';
import { ComposerHitlPanel } from '@/features/agent/components/composer-hitl-panel';
import { ComposerStack } from '@/features/agent/components/composer-stack';
import { ToolActivityRow } from '@/features/agent/components/tool-activity-row';
import { WorkbenchActivityView } from '@/features/agent/components/workbench-activity-view';
import { WorkbenchArtifactView } from '@/features/agent/components/workbench-artifact-view';
import { WorkbenchContextView } from '@/features/agent/components/workbench-context-view';
import { WorkbenchReportView } from '@/features/agent/components/workbench-report-view';
import { WorkbenchSourcesView } from '@/features/agent/components/workbench-sources-view';
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

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerClassName="gap-8 px-4 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="headline">Agent UI 组件目录</Text>
          <Text variant="body-sm" className="mt-1 text-secondary">
            与 Web `/agent` + protocol 已落地能力对齐；未实现能力（Memory / Delegation / Skills / Host
            Git）无对应组件。
          </Text>
        </View>

        <CatalogSection title="壳层 · TopBar" description="左 Drawer · 中标题；工作台由工具行/快捷按钮打开">
          <ChatTopBar />
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

        <CatalogSection title="Composer · 默认">
          <ComposerStack />
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
          description="Mobile Tab：活动 / 来源 / 产物 / Report / Context（无 Plan Tab）"
        >
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              Activity
            </Text>
            <View className="h-48">
              <WorkbenchActivityView />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              Sources
            </Text>
            <View className="h-56">
              <WorkbenchSourcesView />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              Artifact
            </Text>
            <View className="h-64">
              <WorkbenchArtifactView />
            </View>
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              Report
            </Text>
            <WorkbenchReportView />
          </View>
          <View className="overflow-hidden rounded-panel border border-composer-border bg-surface">
            <Text variant="caption" className="border-b border-composer-border px-3 py-2 font-semibold">
              Context
            </Text>
            <WorkbenchContextView />
          </View>
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
