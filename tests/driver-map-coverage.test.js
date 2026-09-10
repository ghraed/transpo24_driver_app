import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import { getDriverAvailability, getDriverRequestAlerts } from '@/lib/api';
import { RequestTypeTabs } from '@/components/request-type-tabs';
import DriverMap from '../src/app/driver-map';

const mockT = key => key;
const mockRouter = { push: jest.fn() };
const mockAnimate = jest.fn();
const mockFit = jest.fn();
const mockRemove = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: fn => require('react').useEffect(fn, [fn]) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: async () => {} }));
jest.mock('@/lib/api', () => ({ getDriverAvailability: jest.fn(), getDriverRequestAlerts: jest.fn(), updateDriverOnlineStatus: jest.fn() }));
jest.mock('expo-location', () => ({ PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 }, requestForegroundPermissionsAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), watchPositionAsync: jest.fn() }));
jest.mock('@/components/native-maps', () => {
  const React = require('react');
  return { isNativeMapRuntimeAvailable: true, NativeMarker: 'Marker', NativeMapView: React.forwardRef(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate, fitToCoordinates: mockFit }));
    return React.createElement('MapView', props, props.children);
  }) };
});
const fix = { coords: { latitude: 47.38, longitude: 8.54 } };
const alert = (id, immediate, eligible = true) => ({ requestId: id, alertId: id, isCurrentlyEligible: eligible, schedule: { isImmediate: immediate }, pickup: { latitude: 47.38, longitude: 8.54 }, dropoff: { latitude: null, longitude: null } });
let tree;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  getDriverAvailability.mockResolvedValue({ isOnline: true, baseLatitude: 47.38, baseLongitude: 8.54, cityCoverage: [{ city: 'Zurich', latitude: 47.38, longitude: 8.54 }] });
  getDriverRequestAlerts.mockResolvedValue({ alerts: [alert('immediate', true), alert('scheduled', false), alert('old', true, false)], locationReference: 'GPS' });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getLastKnownPositionAsync.mockResolvedValue(fix);
  Location.getCurrentPositionAsync.mockResolvedValue(fix);
  Location.watchPositionAsync.mockResolvedValue({ remove: mockRemove });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function render() { await act(async () => { tree = create(<DriverMap />); }); }
const pickupMarkers = () => tree.root.findAllByType('Marker').filter(marker => marker.props.title === 'Pickup');
it('opens at local zoom and shows current immediate matches only', async () => {
  await render();
  const map = tree.root.findByType('MapView');
  expect(map.props.initialRegion).toEqual({ latitude: 47.38, longitude: 8.54, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  expect(pickupMarkers()).toHaveLength(1);
  await act(async () => pickupMarkers()[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { requestId: 'immediate' } }));
});
it('switches to eligible scheduled pickups and centers their city coverage', async () => {
  await render();
  await act(async () => tree.root.findByType(RequestTypeTabs).props.onChange('scheduled'));
  expect(pickupMarkers()).toHaveLength(1);
  await act(async () => pickupMarkers()[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { requestId: 'scheduled' } }));
  expect(mockAnimate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 47.38 }), 350);
});
it('never mounts a world map while location and base are unavailable', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  getDriverAvailability.mockResolvedValue({ isOnline: true, baseLatitude: null, baseLongitude: null, cityCoverage: [] });
  await render();
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
});
it('uses the saved base at local zoom when GPS permission is denied', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await render();
  expect(tree.root.findByType('MapView').props.initialRegion.latitudeDelta).toBe(0.02);
});
it('does not create an additional location subscription when recentering', async () => {
  await render();
  const button = tree.root.findAll(node => node.props.accessibilityLabel === 'Center map on my current location' && typeof node.props.onPress === 'function')[0];
  await act(async () => button.props.onPress());
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount()); tree = null;
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
