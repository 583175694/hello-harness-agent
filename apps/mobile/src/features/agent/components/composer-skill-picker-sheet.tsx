import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SkillCatalogItem } from '../fixtures/skill-fixtures';
import { useSkillCatalog } from '../hooks/use-skill-catalog';
import { useComposerPlaceholderColor } from '@/lib/use-composer-placeholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/lib/use-theme-colors';
import { ComposerBottomDrawer } from './composer-bottom-drawer';
import { ComposerSheetFloatingCard, ComposerSheetGrabHandle } from './composer-sheet-chrome';

type ComposerSkillPickerSheetProps = {
  visible: boolean;
  selected: string[];
  onClose: () => void;
  onToggleSkill: (name: string) => void;
  /** overlay：与 Workbench BottomSheet 并存；modal：Preview / Catalog */
  presentation?: 'overlay' | 'modal';
};

function SkillPickerBody({
  selected,
  onClose,
  onToggleSkill,
  visible,
}: Pick<ComposerSkillPickerSheetProps, 'selected' | 'onClose' | 'onToggleSkill' | 'visible'>) {
  const [query, setQuery] = useState('');
  const composerPlaceholderColor = useComposerPlaceholderColor();
  const { skills: filtered, loading } = useSkillCatalog(query, visible);

  return (
    <>
      <ComposerSheetGrabHandle />

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
    </>
  );
}

export function ComposerSkillPickerSheet({
  visible,
  selected,
  onClose,
  onToggleSkill,
  presentation = 'overlay',
}: ComposerSkillPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const bottomPad = Math.max(insets.bottom, 10);

  if (presentation === 'modal') {
    return (
      <ComposerBottomDrawer visible={visible} onClose={onClose}>
        <SkillPickerBody
          visible={visible}
          selected={selected}
          onClose={onClose}
          onToggleSkill={onToggleSkill}
        />
      </ComposerBottomDrawer>
    );
  }

  if (!visible) {
    return null;
  }

  return (
    <View className="absolute inset-0 z-[110] justify-end" pointerEvents="box-none">
      <Pressable
        className="absolute inset-0"
        style={{ backgroundColor: themeColors.overlayScrim }}
        onPress={onClose}
        accessibilityLabel="关闭"
      />
      <View
        className="gap-2 px-3"
        style={{ paddingBottom: bottomPad }}
        pointerEvents="box-none"
      >
        <ComposerSheetFloatingCard>
          <SkillPickerBody
            visible={visible}
            selected={selected}
            onClose={onClose}
            onToggleSkill={onToggleSkill}
          />
        </ComposerSheetFloatingCard>
      </View>
    </View>
  );
}
