import { Modal, Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft, Plus, Search, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { sessionDrawerFixture, type SessionDrawerItemFixture } from '../fixtures/ui-fixtures';
import { cn } from '@/lib/cn';

type SessionDrawerProps = {
  visible: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
};

function SessionDrawerRow({ item }: { item: SessionDrawerItemFixture }) {
  return (
    <Pressable
      className={cn(
        'relative min-h-11 justify-center rounded-lg px-3 py-2.5',
        item.active ? 'bg-[#eaeae6]' : 'active:bg-subtle',
      )}
    >
      <View className="flex-row items-center gap-2">
        {item.running ? <View className="h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" /> : null}
        <View className="min-w-0 flex-1 flex-row items-baseline justify-between gap-2">
          <Text
            variant="body-sm"
            className={cn('flex-1 truncate', item.active ? 'font-semibold' : 'font-medium')}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text variant="caption" className="shrink-0 text-muted">
            {item.time}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function SessionDrawer({ visible, onClose, onOpenSettings }: SessionDrawerProps) {
  const insets = useSafeAreaInsets();
  const pinned = sessionDrawerFixture.filter((item) => item.pinned);
  const recent = sessionDrawerFixture.filter((item) => !item.pinned);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 flex-row">
        <View
          className="h-full border-r border-composer-border bg-drawer shadow-2xl"
          style={{ width: '78%', paddingTop: insets.top }}
        >
          <View className="flex-1 px-4 pt-4">
            <Pressable
              className="mb-3 min-h-11 flex-row items-center gap-2 rounded-lg active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="新建会话"
            >
              <Plus size={20} color="#171717" />
              <Text variant="body" className="font-semibold text-primary">
                新对话
              </Text>
            </Pressable>

            <View className="relative mb-3">
              <View className="pointer-events-none absolute bottom-0 left-3 top-0 justify-center">
                <Search size={16} color="#898986" />
              </View>
              <Input className="h-10 pl-9" placeholder="搜索会话" />
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              {pinned.length > 0 ? (
                <View className="mb-3">
                  <Text variant="caption" className="mb-1 px-1 text-muted">
                    置顶
                  </Text>
                  {pinned.map((item) => (
                    <SessionDrawerRow key={item.id} item={item} />
                  ))}
                </View>
              ) : null}

              <View>
                <Text variant="caption" className="mb-1 px-1 text-muted">
                  最近
                </Text>
                {recent.map((item) => (
                  <SessionDrawerRow key={item.id} item={item} />
                ))}
              </View>
            </ScrollView>
          </View>

          <View
            className="border-t border-composer-border px-4 pt-2"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <Pressable
              onPress={onOpenSettings}
              className="min-h-11 flex-row items-center gap-2.5 rounded-lg px-1 active:bg-subtle"
              accessibilityRole="button"
              accessibilityLabel="设置"
            >
              <Settings size={20} color="#555551" />
              <Text variant="body-sm" className="font-medium text-primary">
                设置
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable className="flex-1 items-center bg-black/45 pt-14 active:bg-black/50" onPress={onClose}>
          <View className="mt-2 h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40">
            <ChevronLeft size={18} color="rgba(255,255,255,0.85)" />
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}
