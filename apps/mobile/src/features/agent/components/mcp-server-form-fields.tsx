import { Pressable, View } from 'react-native';
import { Input } from '@/components/ui/input';
import { SettingsSwitch } from '@/components/ui/settings-switch';
import { Text } from '@/components/ui/text';
import type { McpFormState } from '../model/mcp-form';

type McpServerFormFieldsProps = {
  form: McpFormState;
  onChange: (next: McpFormState) => void;
  token: string;
  onTokenChange: (value: string) => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-panel border border-border bg-surface p-4">
      <Text variant="headline" className="mb-3 text-[15px]">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function McpServerFormFields({
  form,
  onChange,
  token,
  onTokenChange,
}: McpServerFormFieldsProps) {
  const patch = (partial: Partial<McpFormState>) => onChange({ ...form, ...partial });

  return (
    <View className="gap-4">
      <Section title="基本信息">
        <Text variant="body-sm" className="mb-2">
          名称
        </Text>
        <Input
          value={form.serverName}
          onChangeText={(serverName) => patch({ serverName })}
          placeholder="server-name"
          autoCapitalize="none"
        />
        <View className="mt-3">
          <SettingsSwitch
            label="启用"
            value={form.enabled}
            onValueChange={(enabled) => patch({ enabled })}
          />
        </View>
      </Section>

      <Section title="连接">
        <Text variant="body-sm" className="mb-2">
          URL
        </Text>
        <Input
          value={form.url}
          onChangeText={(url) => patch({ url })}
          placeholder="https://…"
          autoCapitalize="none"
        />
        <Text variant="body-sm" className="mb-2 mt-3">
          Headers（JSON 对象）
        </Text>
        <Input
          value={JSON.stringify(form.headersPlain, null, 0)}
          onChangeText={(text) => {
            try {
              const parsed = JSON.parse(text || '{}') as Record<string, string>;
              patch({ headersPlain: parsed });
            } catch {
              /* ignore while typing */
            }
          }}
          multiline
          className="min-h-[72px] font-mono text-[12px]"
        />
        <Text variant="body-sm" className="mb-2 mt-3">
          凭证 Token（演示）
        </Text>
        <Input value={token} onChangeText={onTokenChange} secureTextEntry placeholder="可选" />
      </Section>

      <Section title="超时（毫秒）">
        <Text variant="body-sm" className="mb-2">
          启动超时
        </Text>
        <Input
          value={String(form.startupTimeoutMs)}
          onChangeText={(v) => patch({ startupTimeoutMs: Number(v) || 0 })}
          keyboardType="number-pad"
        />
        <Text variant="body-sm" className="mb-2 mt-3">
          工具调用超时
        </Text>
        <Input
          value={String(form.toolCallTimeoutMs)}
          onChangeText={(v) => patch({ toolCallTimeoutMs: Number(v) || 0 })}
          keyboardType="number-pad"
        />
      </Section>

      <Section title="策略">
        <SettingsSwitch
          label="必需服务器"
          value={form.required}
          onValueChange={(required) => patch({ required })}
        />
        <SettingsSwitch
          label="启动失败则报错"
          value={form.failOnStartupError}
          onValueChange={(failOnStartupError) => patch({ failOnStartupError })}
        />
        <Text variant="body-sm" className="mb-2 mt-2">
          默认审批
        </Text>
        <View className="flex-row gap-2">
          {(
            [
              { id: 'require_approval' as const, label: '手动' },
              { id: 'auto_execute' as const, label: '自动' },
            ] as const
          ).map((mode) => (
            <Pressable
              key={mode.id}
              onPress={() => patch({ defaultApproval: mode.id })}
              className={`rounded-full border px-3 py-1 ${
                form.defaultApproval === mode.id ? 'border-primary bg-subtle' : 'border-border'
              }`}
            >
              <Text variant="caption">{mode.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="body-sm" className="mb-2 mt-3">
          最大指令字节
        </Text>
        <Input
          value={String(form.maxInstructionBytes)}
          onChangeText={(v) => patch({ maxInstructionBytes: Number(v) || 0 })}
          keyboardType="number-pad"
        />
      </Section>

      <Section title="重连">
        <SettingsSwitch
          label="启用重连"
          value={form.reconnectEnabled}
          onValueChange={(reconnectEnabled) => patch({ reconnectEnabled })}
        />
        <Text variant="body-sm" className="mb-2 mt-3">
          最大重连次数
        </Text>
        <Input
          value={String(form.reconnectMaxAttempts)}
          onChangeText={(v) => patch({ reconnectMaxAttempts: Number(v) || 0 })}
          keyboardType="number-pad"
        />
      </Section>
    </View>
  );
}

export type { McpFormState };
