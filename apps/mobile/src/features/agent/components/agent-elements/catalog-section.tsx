import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

export function CatalogSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2.5">
      <View>
        <Text variant="headline" className="text-[15px]">
          {title}
        </Text>
        {description ? (
          <Text variant="caption" className="mt-0.5 text-secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <View className="gap-2">{children}</View>
    </View>
  );
}
