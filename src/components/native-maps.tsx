import React from 'react';
import { Platform } from 'react-native';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPressEvent = {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
};

type GenericComponent = React.ComponentType<any>;

let MapViewComponent: GenericComponent | null = null;
let MarkerComponent: GenericComponent | null = null;
let MapViewDirectionsComponent: GenericComponent | null = null;
let GoogleProvider: unknown;

if (Platform.OS !== 'web') {
  const mapsModule = require('react-native-maps') as {
    default: GenericComponent;
    Marker: GenericComponent;
    PROVIDER_GOOGLE?: unknown;
  };

  MapViewComponent = mapsModule.default;
  MarkerComponent = mapsModule.Marker;
  GoogleProvider = mapsModule.PROVIDER_GOOGLE;

  try {
    const directionsModule = require('react-native-maps-directions') as {
      default: GenericComponent;
    };
    MapViewDirectionsComponent = directionsModule.default;
  } catch {
    MapViewDirectionsComponent = null;
  }
}

export const NativeMapView = MapViewComponent;
export const NativeMarker = MarkerComponent;
export const NativeMapViewDirections = MapViewDirectionsComponent;
export const PROVIDER_GOOGLE = GoogleProvider;
export const isNativeMapRuntimeAvailable =
  Platform.OS !== 'web' && NativeMapView !== null && NativeMarker !== null;
