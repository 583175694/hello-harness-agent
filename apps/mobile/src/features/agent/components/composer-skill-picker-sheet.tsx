import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { skillCatalogFixtures, type SkillCatalogItem } from '../fixtures/skill-fixtures';

type ComposerSkillPickerSheetProps = {
  visible: boolean;
  selected: string[];
  onClose: () => void;
  onToggleSkill: (name: string) => void;
};

export function ComposerSkillPickerSheet({
  visible,
  selected,
  onClose,
  onToggleSkill,
}: ComposerSkillPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skillCatalogFixtures;
    return skillCatalogFixtures.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay-scrim" onPress={onClose} />
      <View
        className="max-h-[70%] rounded-t-panel border-t border-border bg-surface"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View className="items-center py-2">
          <View className="h-1 w-9 rounded-full bg-border" />
        </View>
        <Text variant="body-sm" className="px-4 pb-2 font-semibold">
          选择 Skill
        </Text>
        <View className="px-4 pb-2">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="搜索技能…"
            className="h-10"
          />
        </View>
        <ScrollView className="px-2" keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <Text variant="body-sm" className="px-4 py-6 text-center text-muted">
              没有匹配的技能
            </Text>
          ) : (
            filtered.map((skill: SkillCatalogItem) => {
              const active = selected.includes(skill.name);
              return (
                <Pressable
                  key={skill.name}
                  onPress={() => onToggleSkill(skill.name)}
                  className={`mx-2 mb-2 rounded-control border px-3 py-3 ${
                    active ? 'border-primary bg-subtle' : 'border-composer-border bg-surface'
                  }`}
                >
                  <Text variant="body-sm" className="font-semibold">
                    {skill.name}
                  </Text>
                  <Text variant="caption" className="mt-1 text-secondary">
                    {skill.description}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <Pressable
          onPress={onClose}
          className="mx-4 mt-2 items-center rounded-control bg-subtle py-3 active:bg-subtle-pressed"
        >
          <Text variant="body-sm" className="font-semibold">
            完成
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
