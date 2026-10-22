import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SkillCatalogItem } from '../fixtures/skill-fixtures';
import { useSkillCatalog } from '../hooks/use-skill-catalog';
import { useComposerPlaceholderColor } from '@/lib/use-composer-placeholder';
import { ComposerBottomDrawer } from './composer-bottom-drawer';
import {
  ComposerSheetGrabHandle,
  ComposerSheetHeader,
} from './composer-sheet-chrome';

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
  const [query, setQuery] = useState('');
  const composerPlaceholderColor = useComposerPlaceholderColor();
  const { skills: filtered, loading, fromApi } = useSkillCatalog(query, visible);

  return (
    <ComposerBottomDrawer visible={visible} onClose={onClose}>
      <ComposerSheetGrabHandle />
      <ComposerSheetHeader
        title={fromApi ? 'Skill · API' : 'Skill'}
        actionLabel="完成"
        onAction={onClose}
      />

      <View className="mx-4 mb-2 h-10 justify-center rounded-full bg-subtle px-4">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索"
          placeholderTextColor={composerPlaceholderColor}
          className="p-0 text-[15px] text-primary"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        className="max-h-80"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && filtered.length === 0 ? (
          <View className="items-center py-10">
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 ? (
          <Text variant="body-sm" className="px-4 py-10 text-center text-muted">
            没有匹配的技能
          </Text>
        ) : (
          filtered.map((skill: SkillCatalogItem, index) => {
            const active = selected.includes(skill.name);
            return (
              <Pressable
                key={skill.name}
                onPress={() => onToggleSkill(skill.name)}
                className={`min-h-[48px] flex-row items-center gap-2 px-4 active:bg-subtle ${
                  index < filtered.length - 1 ? 'border-b border-composer-border' : ''
                }`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={skill.name}
                accessibilityHint={skill.description}
              >
                <Text
                  variant="body"
                  className={`min-w-0 flex-1 font-normal ${active ? 'text-primary' : 'text-secondary'}`}
                  numberOfLines={1}
                >
                  {skill.name}
                </Text>
                {active ? (
                  <Icon icon={Check} tone="primary" size={20} strokeWidth={2.25} />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ComposerBottomDrawer>
  );
}
