import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DriverIcon } from '@/components/ui/driver-ui';
import { driverRadius, useDriverColors } from '@/theme/driver-theme';

type Props = {
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function NavigationCameraToggle({ active, disabled, onPress, style }: Props) {
  const { t } = useTranslation();
  const colors = useDriverColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(active ? 'Switch to overview map' : 'Switch to navigation view')}
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.border },
        style,
        (disabled || pressed) && styles.dimmed,
      ]}
    >
      <DriverIcon
        name={{ ios: active ? 'map' : 'location.north.fill', android: active ? 'map' : 'navigation', web: active ? 'map' : 'navigation' }}
        size={24}
        color={active ? colors.onPrimary : colors.success}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: driverRadius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
});
