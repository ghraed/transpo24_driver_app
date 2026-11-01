import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import { getDriverAvailability, getDriverMapRequests } from '@/lib/api';
import { NavigationCameraToggle } from '@/components/navigation-camera-toggle';
import { RequestTypeTabs } from '@/components/request-type-tabs';
import DriverMap from '../src/app/driver-map';

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { status: 'APPROVED', isProfileCompleted: true } }) }));

const mockT = key => key;
const mockRouter = { push: jest.fn() };
const mockAnimate = jest.fn();
const mockFit = jest.fn();
const mockAnimateCamera = jest.fn();
const mockOverviewCamera = { center: { latitude: 47.38, longitude: 8.54 }, pitch: 0, heading: 0, zoom: 14, altitude: 4000 };
const mockGetCamera = jest.fn();
const mockRemove = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: fn => require('react').useEffect(fn, [fn]) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: async () => {} }));
jest.mock('@/lib/api', () => ({ getDriverAvailability: jest.fn(), getDriverMapRequests: jest.fn(), updateDriverOnlineStatus: jest.fn() }));
jest.mock('expo-location', () => ({ PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 }, requestForegroundPermissionsAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), watchPositionAsync: jest.fn() }));
jest.mock('@/components/native-maps', () => {
  const React = require('react');
  return { isNativeMapRuntimeAvailable: true, NativeMarker: 'Marker', NativeMapView: React.forwardRef(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate, fitToCoordinates: mockFit, animateCamera: mockAnimateCamera, getCamera: mockGetCamera }));
    return React.createElement('MapView', props, props.children);
  }) };
});
const fix = { coords: { latitude: 47.38, longitude: 8.54 } };
const alert = (id, immediate, eligible = true) => ({ requestId: id, alertId: id, isCurrentlyEligible: eligible, schedule: { isImmediate: immediate }, pickup: { latitude: 47.38, longitude: 8.54 }, dropoff: { latitude: null, longitude: null } });
let tree;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  mockGetCamera.mockResolvedValue(mockOverviewCamera);
  getDriverAvailability.mockResolvedValue({ isOnline: true, baseLatitude: 47.38, baseLongitude: 8.54, cityCoverage: [{ city: 'Zurich', latitude: 47.38, longitude: 8.54 }] });
  getDriverMapRequests.mockResolvedValue({ alerts: [alert('immediate', true), alert('scheduled', false), alert('outside-notification-radius', true, false)] });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getLastKnownPositionAsync.mockResolvedValue(fix);
  Location.getCurrentPositionAsync.mockResolvedValue(fix);
  Location.watchPositionAsync.mockResolvedValue({ remove: mockRemove });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function render() { await act(async () => { tree = create(<DriverMap />); }); }
const pickupMarkers = () => tree.root.findAllByType('Marker').filter(marker => marker.props.title === 'Pickup');
it('opens at local zoom and shows all open immediate jobs regardless of notification eligibility', async () => {
  await render();
  const map = tree.root.findByType('MapView');
  expect(map.props.initialRegion).toEqual({ latitude: 47.38, longitude: 8.54, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  expect(pickupMarkers()).toHaveLength(2);
  await act(async () => pickupMarkers()[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { requestId: 'immediate' } }));
});
it('switches to scheduled pickups', async () => {
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
  getDriverMapRequests.mockResolvedValue({ alerts: [] });
  await render();
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
});
it('uses an open pickup at local zoom when GPS permission is denied', async () => {
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

it('switches to a heading-following camera and restores the overview without restarting GPS', async () => {
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { ...fix.coords, heading: 90 } });
  await render();
  const toggle = () => tree.root.findByType(NavigationCameraToggle);
  expect(toggle().props.active).toBe(false);
  await act(async () => toggle().props.onPress());
  expect(toggle().props.active).toBe(true);
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(expect.objectContaining({
    center: fix.coords, pitch: 60, heading: 90, zoom: 18,
  }), { duration: 350 });
  const onPosition = Location.watchPositionAsync.mock.calls[0][1];
  const moved = { latitude: 47.39, longitude: 8.55, heading: 120 };
  mockAnimate.mockClear();
  await act(async () => onPosition({ coords: moved }));
  expect(mockAnimate).not.toHaveBeenCalled();
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(expect.objectContaining({
    center: { latitude: moved.latitude, longitude: moved.longitude }, heading: 120, pitch: 60,
  }), expect.any(Object));
  await act(async () => onPosition({ coords: { ...moved, heading: -1 } }));
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(expect.objectContaining({ heading: 120 }), expect.any(Object));
  await act(async () => tree.root.findByType(RequestTypeTabs).props.onChange('scheduled'));
  expect(mockAnimate).not.toHaveBeenCalled();
  await act(async () => toggle().props.onPress());
  expect(toggle().props.active).toBe(false);
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(mockOverviewCamera, { duration: 350 });
  const count = mockAnimateCamera.mock.calls.length;
  await act(async () => onPosition({ coords: moved }));
  expect(mockAnimateCamera).toHaveBeenCalledTimes(count);
  // Changing job tabs already restarts tracking; camera toggles must not add subscriptions.
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2);
});
it('disables the navigation toggle until a driver location is available', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await render();
  expect(tree.root.findByType(NavigationCameraToggle).props.disabled).toBe(true);
});
it('can return to a flat camera if reading the previous camera fails', async () => {
  mockGetCamera.mockRejectedValue(new Error('Camera unavailable'));
  await render();
  const toggle = () => tree.root.findByType(NavigationCameraToggle);
  await act(async () => toggle().props.onPress());
  await act(async () => toggle().props.onPress());
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0, heading: 0 }), { duration: 350 });
});
