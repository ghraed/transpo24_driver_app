import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { MapMarkerProps } from 'react-native-maps';
import { NativeMarker } from './native-maps';
import { driverRequestMarkerColors, useDriverColors } from '@/theme/driver-theme';

const symbols = {
  vehicle: 'M5 11L7 5H17L19 11 M5 11H19V18H5Z M7 18V20 M17 18V20 M7 14H8 M16 14H17',
  motorcycle: 'M8 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M23 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M5 16L9 10H15L19 16H10L5 16 M7 8H12 M16 5H18L21 16',
  bicycle: 'M9 17a4 4 0 1 0-8 0a4 4 0 1 0 8 0 M23 17a4 4 0 1 0-8 0a4 4 0 1 0 8 0 M5 17L10 7L15 17H5 M10 7H17 M15 17L18 4H15 M8 4H11',
  goods: 'M12 2L22 8V18L12 23L2 18V8Z M2 8L12 13L22 8 M12 13V23 M7 5L17 11',
  furniture: 'M5 11V7Q5 4 8 4H16Q19 4 19 7V11 M5 16H19 M5 12Q2 9 2 13V19H22V13Q22 9 19 12V16 M5 12V16 M5 19V22 M19 19V22',
  other: 'M3 4H16V18H3Z M16 9H20L23 13V18H16 M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M17 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
} as const;

type Props = Omit<MapMarkerProps, 'children' | 'anchor' | 'pinColor'> & {
  serviceKey?: string | null;
  itemType?: string | null;
};
export function MapRequestMarker({ serviceKey, itemType, ...props }: Props) {
  const colors = useDriverColors();
  const kind = serviceKey === 'VEHICLE_TRANSPORT' ? 'vehicle'
    : serviceKey === 'MOTORCYCLE_TRANSPORT' ? (itemType === 'OTHER' ? 'bicycle' : 'motorcycle')
    : serviceKey === 'GOODS_TRANSPORT' ? 'goods'
    : serviceKey === 'FURNITURE_TRANSPORT' ? 'furniture' : 'other';
  if (!NativeMarker) return null;
  return <NativeMarker {...props} anchor={{ x: 0.5, y: 54 / 56 }}>
    <View collapsable={false} style={{ width: 48, height: 56 }}>
      <Svg width={48} height={56} viewBox="0 0 48 56">
        <Path d="M24 54C20 47 4 33 4 22a20 20 0 0 1 40 0c0 11-16 25-20 32Z" fill={driverRequestMarkerColors[kind]} stroke={colors.surface} strokeWidth={2} />
        <G transform="translate(12 9)">
          <Path d={symbols[kind]} fill="none" stroke={colors.surface} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      </Svg>
    </View>
  </NativeMarker>;
}
