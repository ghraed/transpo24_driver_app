import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { getDriverAvailability, getDriverMapRequests } from '@/lib/api';
import { NavigationCameraToggle } from '@/components/navigation-camera-toggle';
import DriverMap from '../src/app/driver-map';

jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.transpo24.com' }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { status: 'APPROVED', isProfileCompleted: true, countryCode: 'LB' } }) }));

const mockT = key => key;
const mockRouter = { push: jest.fn() };
const mockAnimate = jest.fn();
const mockFit = jest.fn();
const mockAnimateCamera = jest.fn();
const mockOverviewCamera = { center: { latitude: 47.38, longitude: 8.54 }, pitch: 0, heading: 0, zoom: 14, altitude: 4000 };
const mockGetCamera = jest.fn();
const mockRemove = jest.fn();
let mockFocused = true;
const mockDriverMarkerMounted = jest.fn();
const mockDriverMarkerUnmounted = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: fn => require('react').useEffect(() => mockFocused ? fn() : undefined, [fn, mockFocused]) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: async () => {} }));
jest.mock('@/services/socketService', () => ({ connectSocket: jest.fn(), onRequestNew: () => () => {}, onRequestDeleted: () => () => {} }));
jest.mock('@/lib/api', () => ({ getDriverAvailability: jest.fn(), getDriverMapRequests: jest.fn(), updateDriverOnlineStatus: jest.fn() }));
jest.mock('expo-location', () => ({ PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 }, requestForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), reverseGeocodeAsync: jest.fn(), watchPositionAsync: jest.fn() }));
jest.mock('@/components/native-maps', () => {
  const React = require('react');
  return { isNativeMapRuntimeAvailable: true, NativeMarker: function MockMarker(props) {
    React.useEffect(() => {
      if (props.title !== 'Your current location') return;
      mockDriverMarkerMounted();
      return () => mockDriverMarkerUnmounted();
    }, [props.title]);
    return React.createElement('Marker', props, props.children);
  }, NativeMapView: React.forwardRef(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate, fitToCoordinates: mockFit, animateCamera: mockAnimateCamera, getCamera: mockGetCamera }));
    return React.createElement('MapView', props, props.children);
  }) };
});
const fix = { coords: { latitude: 47.38, longitude: 8.54 } };
const alert = (id, immediate, eligible = true) => ({ requestId: id, alertId: id, isCurrentlyEligible: eligible, schedule: { isImmediate: immediate }, pickup: { latitude: 47.38, longitude: 8.54 }, dropoff: { latitude: null, longitude: null } });
let tree;
let appStateListener;
let onAppStateChange;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockFocused = true;
  appStateListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, callback) => {
    if (event === 'change') onAppStateChange = callback;
    return { remove: jest.fn() };
  });
  mockGetCamera.mockResolvedValue(mockOverviewCamera);
  getDriverAvailability.mockResolvedValue({ isOnline: true, baseLatitude: 47.38, baseLongitude: 8.54, cityCoverage: [{ city: 'Zurich', latitude: 47.38, longitude: 8.54 }] });
  getDriverMapRequests.mockResolvedValue({ alerts: [alert('immediate', true), alert('scheduled', false), alert('outside-notification-radius', true, false)] });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.getLastKnownPositionAsync.mockResolvedValue(fix);
  Location.getCurrentPositionAsync.mockResolvedValue(fix);
  Location.reverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'LB' }]);
  Location.watchPositionAsync.mockResolvedValue({ remove: mockRemove });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; appStateListener.mockRestore(); jest.useRealTimers(); });
async function render() { await act(async () => { tree = create(<DriverMap />); }); }
const pickupMarkers = () => tree.root.findAllByType('Marker').filter(marker => marker.props.title === 'Pickup');
it('opens at country overview and shows all open jobs regardless of notification eligibility', async () => {
  await render();
  const map = tree.root.findByType('MapView');
  expect(map.props.initialRegion.latitude).toBeCloseTo(33.865);
  expect(map.props.initialRegion.longitude).toBeCloseTo(35.87);
  expect(map.props.initialRegion.latitudeDelta).toBeCloseTo(1.9375);
  expect(pickupMarkers()).toHaveLength(3);
  await act(async () => pickupMarkers()[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { requestId: 'immediate' } }));
});
it('fits the detected country into most of the map without moving it again on GPS updates', async () => {
  await render();
  const map = tree.root.findByType('MapView');
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
    map.props.onMapReady();
  });
  expect(mockFit).toHaveBeenCalledWith([
    { latitude: 33.09, longitude: 35.13 }, { latitude: 34.64, longitude: 36.61 },
  ], { edgePadding: { top: 60, bottom: 60, left: 40, right: 40 }, animated: true });
  expect(mockAnimate).not.toHaveBeenCalled();
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: { latitude: 33.9, longitude: 35.6 } }));
  expect(mockFit).toHaveBeenCalledTimes(1);
  expect(mockAnimate).not.toHaveBeenCalled();
});
it('uses the country at the GPS position when it differs from the profile country', async () => {
  Location.reverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'CH' }]);
  await render();
  expect(tree.root.findByType('MapView').props.initialRegion.latitude).toBeCloseTo(46.805);
  expect(tree.root.findByType('MapView').props.initialRegion.longitude).toBeCloseTo(8.23);
});
it('does not move the map after the driver pans while reverse geocoding is loading', async () => {
  let resolveCountry;
  Location.reverseGeocodeAsync.mockReturnValue(new Promise(resolve => { resolveCountry = resolve; }));
  await render();
  const map = tree.root.findByType('MapView');
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
    map.props.onMapReady();
    map.props.onPanDrag();
  });
  await act(async () => resolveCountry([{ isoCountryCode: 'LB' }]));
  expect(mockFit).not.toHaveBeenCalled();
});
it('opens scheduled jobs from the map shortcut', async () => {
  await render();
  const shortcut = tree.root.findAll(node => node.props.accessibilityLabel === 'Scheduled' && typeof node.props.onPress === 'function')[0];
  await act(async () => shortcut.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/receive-requests', params: { requestType: 'scheduled' } });
  await act(async () => pickupMarkers()[1].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { requestId: 'scheduled' } }));
});
it('recreates the car pin when the map regains focus after request details', async () => {
  await render();
  expect(mockDriverMarkerMounted).toHaveBeenCalledTimes(1);
  await act(async () => pickupMarkers()[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/review-request-details' }));
  mockFocused = false;
  await act(async () => tree.update(<DriverMap />));
  mockFocused = true;
  await act(async () => tree.update(<DriverMap />));
  expect(mockDriverMarkerUnmounted).toHaveBeenCalledTimes(1);
  expect(mockDriverMarkerMounted).toHaveBeenCalledTimes(2);
  expect(tree.root.findAllByType('Marker').find(marker => marker.props.title === 'Your current location').props.coordinate).toEqual(fix.coords);
});
it('opens the country overview when GPS, base and pickup are unavailable', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  getDriverAvailability.mockResolvedValue({ isOnline: true, baseLatitude: null, baseLongitude: null, cityCoverage: [] });
  getDriverMapRequests.mockResolvedValue({ alerts: [] });
  await render();
  const region = tree.root.findByType('MapView').props.initialRegion;
  expect(region.latitude).toBeCloseTo(33.865);
  expect(region.longitude).toBeCloseTo(35.87);
  expect(region.latitudeDelta).toBeCloseTo(1.9375);
  expect(region.longitudeDelta).toBeCloseTo(1.85);
});
it('uses the profile country overview when GPS permission is denied', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await render();
  expect(tree.root.findByType('MapView').props.initialRegion.latitudeDelta).toBeCloseTo(1.9375);
});
it('quietly starts tracking when location services are enabled while the map remains open', async () => {
  Location.hasServicesEnabledAsync.mockResolvedValue(false);
  await render();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('Text').some(node => node.props.children === 'Unable to get your current location. Check that location services are enabled.')).toBe(true);

  mockAnimate.mockClear();
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  await act(async () => onAppStateChange('active'));
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(mockAnimate).not.toHaveBeenCalled();
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: { latitude: 47.39, longitude: 8.55 } }));
  expect(mockAnimate).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('Text').some(node => node.props.children === 'Unable to get your current location. Check that location services are enabled.')).toBe(false);
  expect(tree.root.findAllByType('Text').some(node => node.props.children === 'Location is back on.')).toBe(true);
  await act(async () => { jest.advanceTimersByTime(3_000); });
  expect(tree.root.findAllByType('Text').some(node => node.props.children === 'Location is back on.')).toBe(false);
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
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
  expect(mockAnimate).not.toHaveBeenCalled();
  await act(async () => toggle().props.onPress());
  expect(toggle().props.active).toBe(false);
  expect(mockAnimateCamera).toHaveBeenLastCalledWith(mockOverviewCamera, { duration: 350 });
  const count = mockAnimateCamera.mock.calls.length;
  await act(async () => onPosition({ coords: moved }));
  expect(mockAnimateCamera).toHaveBeenCalledTimes(count);
  // Camera toggles must not add location subscriptions.
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
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
