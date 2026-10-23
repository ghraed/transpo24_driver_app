import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal } from 'react-native';
import { RequestRouteCard } from './request-route-card';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('./native-maps', () => ({ NativeMapView: 'MapView', NativeMarker: 'Marker', NativePolyline: 'Polyline' }));

jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/localization/i18n', () => ({ language: 'en' }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: async value => value }));

const mockRoute = [
  { latitude: 38.5, longitude: -120.2 },
  { latitude: 40.7, longitude: -120.95 },
  { latitude: 43.252, longitude: -126.453 },
];
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn(async () => ({ json: async () => ({
    status: 'OK', routes: [{ overview_polyline: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }],
  }) }));
});
afterEach(() => { global.fetch = originalFetch; });

const props = {
  pickup: { latitude: 33.89, longitude: 35.50 },
  dropoff: { latitude: 34.43, longitude: 35.84 },
  pickupAddress: 'Beirut', dropoffAddress: 'Tripoli', distance: '70 km',
};
let tree;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const toggle = () => tree.root.findAll(node => node.props.accessibilityState && typeof node.props.onPress === 'function')[0];

test('tapping the route opens both markers, expands the map, closes it, and collapses the preview', async () => {
  await act(async () => { tree = create(<RequestRouteCard {...props} />); });
  expect(toggle().props.accessibilityState.expanded).toBe(false);
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
  await act(async () => toggle().props.onPress());
  expect(toggle().props.accessibilityState.expanded).toBe(true);
  expect(tree.root.findAllByType('Marker').map(node => node.props.coordinate)).toEqual([props.pickup, props.dropoff]);
  expect(global.fetch.mock.calls[0][0]).toContain('origin=33.89%2C35.5');
  expect(global.fetch.mock.calls[0][0]).toContain('destination=34.43%2C35.84');
  expect(tree.root.findByType('Polyline').props.coordinates).toEqual(mockRoute);
  expect(tree.root.findByType('Polyline').props.strokeColor).toBe('#2563EB');
  const fitToCoordinates = jest.fn();
  const map = tree.root.findByType('MapView');
  map.props.ref.current = { fitToCoordinates };
  map.props.onMapReady();
  expect(fitToCoordinates).toHaveBeenCalledWith(mockRoute, expect.any(Object));
  await act(async () => button('pickupUi.expandMap').props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(tree.root.findAllByType('MapView')).toHaveLength(1);
  expect(tree.root.findByType('Polyline').props.coordinates).toEqual(mockRoute);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(tree.root.findAllByType('Marker')).toHaveLength(2);
  await act(async () => toggle().props.onPress());
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
});

test('invalid coordinates are excluded and missing locations show a fallback', async () => {
  await act(async () => { tree = create(<RequestRouteCard {...props} pickup={{ latitude: NaN, longitude: 35 }} />); });
  await act(async () => toggle().props.onPress());
  expect(tree.root.findAllByType('Marker').map(node => node.props.coordinate)).toEqual([props.dropoff]);
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => tree.update(<RequestRouteCard {...props} pickup={{ latitude: null, longitude: null }} dropoff={{ latitude: 200, longitude: 35 }} />));
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Location unavailable');
});
