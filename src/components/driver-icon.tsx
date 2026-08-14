import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React from 'react';
import type { ColorValue } from 'react-native';

export type DriverIconName =
  | 'arrow-back'
  | 'calendar'
  | 'car'
  | 'chat'
  | 'check'
  | 'chevron-right'
  | 'clock'
  | 'document'
  | 'filter'
  | 'grid'
  | 'help'
  | 'location'
  | 'logout'
  | 'map'
  | 'money'
  | 'motorcycle'
  | 'furniture'
  | 'goods'
  | 'package'
  | 'profile'
  | 'settings'
  | 'sliders'
  | 'star'
  | 'truck';

type DriverIconProps = {
  name: DriverIconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
  fill?: string;
};

const symbols: Record<DriverIconName, SymbolViewProps['name']> = {
  'arrow-back': { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  calendar: { ios: 'calendar', android: 'event', web: 'event' },
  car: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  check: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  'chevron-right': { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'filter_alt', web: 'filter_alt' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' },
  help: { ios: 'questionmark.circle', android: 'help', web: 'help' },
  location: { ios: 'location', android: 'location_on', web: 'location_on' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  map: { ios: 'map', android: 'map', web: 'map' },
  money: { ios: 'banknote', android: 'payments', web: 'payments' },
  motorcycle: { ios: 'motorcycle', android: 'two_wheeler', web: 'two_wheeler' },
  furniture: { ios: 'bed.double', android: 'bed', web: 'bed' },
  goods: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  package: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  profile: { ios: 'person', android: 'person', web: 'person' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  sliders: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  star: { ios: 'star.fill', android: 'star', web: 'star' },
  truck: { ios: 'truck.box', android: 'local_shipping', web: 'local_shipping' },
};

export function DriverIcon({ name, size = 24, color = '#202124' }: DriverIconProps) {
  return <SymbolView name={symbols[name]} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}
