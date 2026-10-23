import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { MapMarkerProps } from 'react-native-maps';
import { NativeMarker } from './native-maps';

import { MAP_COLORS } from '@/config/map-style';
export { MAP_COLORS } from '@/config/map-style';

export type MapLocationKind = 'pickup' | 'dropoff' | 'driver';

export function MapLocationIcon({ kind }: { kind: MapLocationKind }) {
  return (
    <View collapsable={false} style={{ width: 40, height: 44 }}>
      <Svg width={40} height={44} viewBox="0 0 40 44">
        {kind === 'driver' ? <>
          <Circle cx={20} cy={22} r={18} fill={MAP_COLORS.driverHalo} />
          <Circle cx={20} cy={22} r={8} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={2.5} />
        </> : <>
          <Path d="M20 42C17 37 5 26 5 17a15 15 0 0 1 30 0c0 9-12 20-15 25Z" fill={MAP_COLORS[kind]} stroke="#FFFFFF" strokeWidth={2} />
          {kind === 'pickup'
            ? <Circle cx={20} cy={17} r={5} fill="#FFFFFF" />
            : <Path d="M15 25V10 M15 11C19 8 22 14 27 11V19C22 22 19 16 15 19" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        </>}
      </Svg>
    </View>
  );
}

type Props = Omit<MapMarkerProps, 'children' | 'pinColor' | 'anchor'> & { kind: MapLocationKind };
export function MapLocationMarker({ kind, ...props }: Props) {
  if (!NativeMarker) return null;
  return (
    <NativeMarker {...props} anchor={{ x: 0.5, y: kind === 'driver' ? 0.5 : 42 / 44 }}>
      <MapLocationIcon kind={kind} />
    </NativeMarker>
  );
}
