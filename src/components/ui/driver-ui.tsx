import React, { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextProps,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import {
  driverComponents,
  driverLayout,
  driverRadius,
  driverSpace,
  driverType,
  useDriverColors,
} from '@/theme/driver-theme';

type IconName = ComponentProps<typeof SymbolView>['name'];
export function DriverIcon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const colors = useDriverColors();
  return (
    <SymbolView name={name} size={size} weight="medium" tintColor={color ?? colors.textSecondary} />
  );
}
export function DriverText({
  variant = 'body',
  secondary = false,
  style,
  ...props
}: TextProps & {
  variant?: keyof typeof driverType;
  secondary?: boolean;
}) {
  const colors = useDriverColors();
  return (
    <Text
      {...props}
      style={[
        driverType[variant],
        { color: secondary ? colors.textSecondary : colors.text, textAlign: 'auto' },
        style,
      ]}
    />
  );
}
export function DriverCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useDriverColors();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      {children}
    </View>
  );
}
export function DriverButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'contact';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useDriverColors();
  const blocked = Boolean(disabled || loading);
  const foreground = blocked
    ? colors.onDisabled
    : variant === 'contact'
      ? colors.onContact
      : variant === 'primary'
        ? colors.onPrimary
        : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: Boolean(loading) }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: blocked
            ? colors.disabled
            : variant === 'contact'
              ? colors.contact
              : variant === 'primary'
                ? colors.primary
                : variant === 'secondary'
                  ? colors.surface
                  : 'transparent',
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <DriverIcon name={icon} color={foreground} />
      ) : null}
      <DriverText variant="label" style={{ color: foreground, flexShrink: 1, textAlign: 'center' }}>
        {label}
      </DriverText>
    </Pressable>
  );
}
export function DriverPageHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  trailing,
  rtl = false,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel: string;
  trailing?: ReactNode;
  rtl?: boolean;
}) {
  const colors = useDriverColors();
  return (
    <View style={styles.pageHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.65 : 1,
          },
        ]}
      >
        <DriverIcon
          name={{
            ios: rtl ? 'chevron.right' : 'chevron.left',
            android: rtl ? 'chevron_right' : 'chevron_left',
            web: rtl ? 'chevron_right' : 'chevron_left',
          }}
          color={colors.text}
        />
      </Pressable>
      <View style={styles.headerCopy}>
        <DriverText variant="section">{title}</DriverText>
        {subtitle ? (
          <DriverText variant="caption" secondary>
            {subtitle}
          </DriverText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
export function DriverStatus({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const colors = useDriverColors();
  const foreground = tone === 'neutral' ? colors.textSecondary : colors[tone];
  const backgroundColor = tone === 'neutral' ? colors.surfaceSubtle : colors[`${tone}Soft`];
  return (
    <View style={[styles.status, { backgroundColor }]}>
      <View style={[styles.dot, { backgroundColor: foreground }]} />
      <DriverText variant="caption" style={{ color: foreground, flexShrink: 1 }}>
        {label}
      </DriverText>
    </View>
  );
}
export function DriverNotice({
  title,
  description,
  tone = 'info',
  action,
}: {
  title: string;
  description?: string;
  tone?: 'info' | 'warning' | 'danger';
  action?: ReactNode;
}) {
  const colors = useDriverColors();
  const icon: IconName =
    tone === 'danger'
      ? { ios: 'exclamationmark.circle', android: 'error_outline', web: 'error_outline' }
      : tone === 'warning'
        ? { ios: 'exclamationmark.triangle', android: 'warning_amber', web: 'warning_amber' }
        : { ios: 'info.circle', android: 'info', web: 'info' };
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        { backgroundColor: colors[`${tone}Soft`], borderColor: colors.border },
      ]}
    >
      <DriverIcon name={icon} color={colors[tone]} />
      <View style={styles.noticeBody}>
        <DriverText variant="label" style={{ color: colors[tone] }}>
          {title}
        </DriverText>
        {description ? (
          <DriverText variant="body" secondary>
            {description}
          </DriverText>
        ) : null}
        {action}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  pageHeader: {
    width: '100%',
    maxWidth: driverLayout.maxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: driverSpace.md,
    paddingHorizontal: driverLayout.gutter,
    paddingVertical: driverSpace.md,
  },
  headerCopy: { flex: 1, gap: 2 },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: driverRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: driverComponents.card.padding,
    borderRadius: driverComponents.card.radius,
    borderWidth: 1,
    gap: driverSpace.lg,
  },
  button: {
    minHeight: driverComponents.button.minHeight,
    borderRadius: driverComponents.button.radius,
    borderWidth: 1,
    paddingHorizontal: driverSpace.lg,
    paddingVertical: driverSpace.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: driverComponents.button.gap,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: driverSpace.md,
    paddingVertical: 6,
    borderRadius: driverRadius.pill,
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  notice: {
    padding: driverSpace.lg,
    borderRadius: driverRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: driverSpace.md,
  },
  noticeBody: { flex: 1, gap: driverSpace.xs },
});
