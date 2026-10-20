import { Pressable, ScrollView, View } from 'react-native';
import { Copy, Download, Edit3 } from 'lucide-react-native';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { artifactsFixture } from '../fixtures/ui-fixtures';

const ARTIFACT_DIFF_COPY_TEXT = [
  'def test_totp_verification_success():',
  '    token = pyotp.TOTP(secret).now()',
  '    assert verify_2fa_code(user_id=42, code=token) is True',
].join('\n');

export function WorkbenchArtifactScrollContent() {
  return (
    <View className="gap-3 p-3.5">
      <View className="overflow-hidden rounded-xl border border-white/10 bg-terminal">
        <View className="flex-row items-center justify-between border-b border-white/5 bg-[#16191f] px-3 py-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-[#4ade80]" />
            <Text variant="mono" className="truncate text-zinc-200">
              tests/test_auth_2fa.py
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text variant="caption" className="font-mono text-[#4ade80]">
              +42
            </Text>
            <Text variant="caption" className="font-mono text-rose-400">
              -6
            </Text>
              <Pressable
                onPress={() => void copyTextToClipboard(ARTIFACT_DIFF_COPY_TEXT)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="复制 diff"
                className="h-7 w-7 items-center justify-center rounded active:opacity-70"
              >
                <Icon icon={Copy} tone="onTerminal" size={14} />
              </Pressable>
          </View>
        </View>
        <View className="gap-0.5 p-3">
          <Text variant="mono" className="mb-1 text-zinc-500">
            // 生成的 TOTP 验证回归测试桩
          </Text>
          <Text variant="mono" className="text-zinc-400">
            12 def test_totp_verification_success():
          </Text>
          <Text variant="mono" className="bg-emerald-950/40 px-3 text-[#4ade80]">
            +14 token = pyotp.TOTP(secret).now()
          </Text>
          <Text variant="mono" className="bg-emerald-950/40 px-3 text-[#4ade80]">
            +15 assert verify_2fa_code(user_id=42, code=token) is True
          </Text>
          <Text variant="mono" className="bg-rose-950/40 px-3 text-rose-300">
            -16 # 旧逻辑未校验 timestamp 滑动窗口
          </Text>
        </View>
      </View>

      <View className="gap-1.5">
        <Text variant="caption" className="font-medium tracking-wide text-muted">
          产物文件 (Artifacts)
        </Text>
        {artifactsFixture.map((artifact) => (
          <View
            key={artifact.id}
            className={cn(
              'flex-row items-center justify-between rounded-lg border p-2',
                artifact.selected
                  ? 'border-user-bubble-border bg-user-bubble'
                  : 'border-border bg-canvas',
            )}
          >
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text variant="mono" className="truncate font-medium">
                  {artifact.name}
                </Text>
                <Text variant="caption" className="rounded border border-border bg-subtle px-1.5 font-mono">
                  {artifact.version}
                </Text>
              </View>
              <Text variant="caption" className="text-muted">
                {artifact.description}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function WorkbenchArtifactFooter({ bottomInset = 0 }: { bottomInset?: number }) {
  return (
    <View
      className="gap-2 border-t border-border bg-surface p-3"
      style={{ paddingBottom: Math.max(bottomInset, 12) }}
    >
      <View className="flex-row items-center gap-2">
        <PressableScale className="h-10 flex-row items-center justify-center gap-1.5 rounded-control border border-border bg-subtle px-4 active:bg-[#e8e8e5]">
          <Icon icon={Download} tone="primary" size={18} />
          <Text variant="body-sm" className="font-medium text-primary">
            下载
          </Text>
        </PressableScale>
        <PressableScale className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-primary active:bg-black">
          <Icon icon={Edit3} tone="onPrimary" size={18} />
          <Text variant="body-sm" className="font-medium text-primary-foreground">
            基于此版本修改
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** UI Catalog 等固定高度容器内联预览 */
export function WorkbenchArtifactView() {
  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-3.5" showsVerticalScrollIndicator={false}>
        <WorkbenchArtifactScrollContent />
      </ScrollView>
      <WorkbenchArtifactFooter />
    </View>
  );
}
