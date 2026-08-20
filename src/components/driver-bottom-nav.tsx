import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DriverIcon, type DriverIconName } from '@/components/driver-icon';

type Tab = {
  label: string;
  icon: DriverIconName;
  route: '/driver-map' | '/receive-requests' | '/driver-chats' | '/driver-profile';
};

const tabs: Tab[] = [
  { label: 'Map', icon: 'map', route: '/driver-map' },
  { label: 'Jobs', icon: 'grid', route: '/receive-requests' },
  { label: 'Chat', icon: 'chat', route: '/driver-chats' },
  { label: 'Profile', icon: 'profile', route: '/driver-profile' },
];

export const DRIVER_BOTTOM_NAV_HEIGHT = 76;

export function DriverBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.bar, { height: DRIVER_BOTTOM_NAV_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}> 
      {tabs.map((tab) => {
        const selected = pathname === tab.route;
        const framed = selected && tab.route !== '/driver-map';
        const color = selected ? '#F2B900' : '#9CA6B5';

        return (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) router.replace(tab.route);
            }}
            style={({ pressed }) => [styles.tab, framed && styles.selectedTab, pressed && styles.pressed]}
          >
            <DriverIcon name={tab.icon} size={29} color={color} strokeWidth={1.8} />
            <Text style={[styles.label, selected && styles.selectedLabel]}>{t(tab.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 7,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE1E6',
  },
  tab: {
    width: 72,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 4,
  },
  selectedTab: {
    borderWidth: 2,
    borderColor: '#171717',
  },
  pressed: {
    opacity: 0.65,
  },
  label: {
    color: '#9CA6B5',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  selectedLabel: {
    color: '#F2B900',
  },
});
