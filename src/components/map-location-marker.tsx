import React from 'react';
import { Platform, View } from 'react-native';
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

// Bundled icons remain available on platforms with reliable native image loading.
const MARKER_IMAGES = {
  pickup: require('../../assets/map-markers/pickup.png'),
  dropoff: require('../../assets/map-markers/dropoff.png'),
  driver: require('../../assets/map-markers/driver.png'),
} as const;

type Props = Omit<MapMarkerProps, 'children' | 'pinColor' | 'anchor' | 'image'> & { kind: MapLocationKind };
export function MapLocationMarker({ kind, ...props }: Props) {
  if (!NativeMarker) return null;
  // Android stop pins must not depend on asynchronous image/child-view capture.
  // A new native marker identity also discards old custom-view state after refresh.
  const nativePin = Platform.OS === 'android' && kind !== 'driver';
  return (
    <NativeMarker
      key={`${kind}-${nativePin ? 'native-pin' : 'bundled-icon'}`}
      {...props}
      image={nativePin ? undefined : MARKER_IMAGES[kind]}
      pinColor={MAP_COLORS[kind]}
      zIndex={props.zIndex ?? (kind === 'pickup' ? 30 : kind === 'driver' ? 20 : 10)}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: kind === 'driver' ? 0.5 : nativePin ? 1 : 42 / 44 }}
    />
  );
}
