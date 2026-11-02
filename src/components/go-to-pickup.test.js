import { getRecentTripLocation } from '@/location/trip-location-cache';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import GoToPickupScreen from '@/app/go-to-pickup';
import { getDriverAcceptedJobDetails, startReservedPickup } from '@/lib/api';
import { emitDriverArrivedPickupWithAck, onTripStatusUpdated } from '@/services/socketService';
import { pickupItem } from '@/services/tripService';
import { DriverButton } from './ui/driver-ui';
import { DriverRoutePolyline } from './driver-route-polyline';
import { NavigationCameraToggle } from './navigation-camera-toggle';

const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
const mockFit = jest.fn();
const mockAnimateCamera = jest.fn();
const mockGetCamera = jest.fn(async () => ({ pitch: 0, heading: 0, zoom: 14 }));
const mockParams = {
  tripId: 'trip-12345678',
  pickupLatitude: '33.8938',
  pickupLongitude: '35.5018',
  pickupAddress: 'Beirut',
  dropoffLatitude: '34.4367',
  dropoffLongitude: '35.8497',
  dropoffAddress: 'Tripoli',
};
const mockT = (key, options = {}) =>
  key.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? '');
const mockI18n = { language: 'en', dir: () => 'ltr' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: mockI18n }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
jest.mock('@/components/native-maps', () => {
  const React = require('react');
  return {
    isNativeMapRuntimeAvailable: true,
    NativeMarker: 'Marker',
    NativeMapView: React.forwardRef(function MockMap(props, ref) {
      React.useImperativeHandle(ref, () => ({
        fitToCoordinates: mockFit, animateCamera: mockAnimateCamera, getCamera: mockGetCamera,
      }));
      return React.createElement('MapView', props, props.children);
    }),
  };
});
jest.mock('@/components/driver-chat-button', () => ({ DriverChatButton: () => null }));
jest.mock('@/components/driver-route-polyline', () => ({ DriverRoutePolyline: () => null }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'native-map-key' }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => true) }));
jest.mock('@/location/background-trip-tracking', () => ({
  startBackgroundTripTracking: jest.fn(async () => true),
  stopBackgroundTripTracking: jest.fn(async () => undefined),
}));
jest.mock('@/services/translation-service', () => ({
  translateDynamicBatch: jest.fn(async () => ({})),
}));
jest.mock('@/lib/api', () => ({
  getDriverAcceptedJobDetails: jest.fn(),
  startReservedPickup: jest.fn(),
}));
jest.mock('@/services/tripService', () => ({ pickupItem: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Highest: 6 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///proof.jpg', fileName: 'proof.jpg', mimeType: 'image/jpeg' }],
  })),
}));
jest.mock('@/services/socketService', () => ({
  connectSocket: jest.fn(),
  joinTripRoom: jest.fn(),
  leaveTripRoom: jest.fn(),
  emitDriverLocationUpdate: jest.fn(),
  emitDriverArrivedPickupWithAck: jest.fn(async () => ({})),
  onDriverArrivedPickupConfirmed: jest.fn(() => jest.fn()),
  onItemPickedUp: jest.fn(() => jest.fn()),
  onSocketDisconnect: jest.fn(() => jest.fn()),
  onSocketError: jest.fn(() => jest.fn()),
  onTripStatusUpdated: jest.fn(() => jest.fn()),
}));
let tree;
const text = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');
const button = (label) =>
  tree.root.findAllByType(DriverButton).find((node) => node.props.label === label);
async function mount(status) {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: status });
  await act(async () => {
    tree = create(<GoToPickupScreen />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('@/config/maps').GOOGLE_MAPS_API_KEY = 'native-map-key';
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  emitDriverArrivedPickupWithAck.mockResolvedValue(undefined);
  pickupItem.mockResolvedValue({ status: 'ITEM_PICKED_UP' });
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 33.8938, longitude: 35.5018 },
  });
});

test('opens driving navigation to pickup independently of the route preview', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => tree.root.findByType(DriverRoutePolyline).props.onError('Route unavailable'));
  await act(async () => button('pickupUi.navigateToPickup').props.onPress());
  const url = new URL(Linking.openURL.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
  expect(url.searchParams.get('destination')).toBe('33.8938,35.5018');
  expect(url.searchParams.get('travelmode')).toBe('driving');
  expect(url.searchParams.get('dir_action')).toBe('navigate');
  expect(url.searchParams.has('origin')).toBe(false);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('opens pickup navigation without an in-app GPS fix', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(button('pickupUi.navigateToPickup').props.disabled).toBeUndefined();
  await act(async () => button('pickupUi.navigateToPickup').props.onPress());
  expect(Linking.openURL).toHaveBeenCalled();
});

test('keeps pickup navigation available when the embedded map cannot load', async () => {
  jest.requireMock('@/config/maps').GOOGLE_MAPS_API_KEY = '';
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(tree.root.findAllByType('MapView')).toHaveLength(0);
  await act(async () => button('pickupUi.navigateToPickup').props.onPress());
  expect(Linking.openURL).toHaveBeenCalled();
});

test('shows a recoverable navigation error and keeps the action available in the expanded map', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  const expand = tree.root.findAll(node => node.props.accessibilityLabel === 'pickupUi.expandMap'
    && typeof node.props.onPress === 'function')[0];
  await act(async () => expand.props.onPress());
  Linking.openURL.mockRejectedValueOnce(new Error('No app'));
  await act(async () => button('pickupUi.navigateToPickup').props.onPress());
  expect(text()).toContain('pickupUi.navigationFailed');
  expect(button('pickupUi.navigateToPickup').props.loading).toBe(false);
  await act(async () => button('pickupUi.navigateToPickup').props.onPress());
  expect(text()).not.toContain('pickupUi.navigationFailed');
});

test.each([true, false])('fits the whole pickup route when route resolves before map readiness: %s', async routeFirst => {
  await mount('DRIVER_GOING_TO_PICKUP');
  const coordinates = [{ latitude: 33.8, longitude: 35.5 }, { latitude: 33.8938, longitude: 35.5018 }];
  const ready = () => tree.root.findByType(DriverRoutePolyline).props.onReady(coordinates);
  const mapReady = () => tree.root.findByType('MapView').props.onMapReady();
  await act(async () => { if (routeFirst) ready(); else mapReady(); });
  if (routeFirst) expect(mockFit).not.toHaveBeenCalled();
  else expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ latitude: 33.8938, longitude: 35.5018 }),
  ]), expect.any(Object));
  await act(async () => { if (routeFirst) mapReady(); else ready(); });
  expect(mockFit).toHaveBeenCalledWith(coordinates, expect.objectContaining({ edgePadding: expect.any(Object) }));
  mockFit.mockClear();
  await act(async () => tree.root.findByType(NavigationCameraToggle).props.onPress());
  await act(async () => ready());
  expect(mockFit).not.toHaveBeenCalled();
});

test('clears route failure feedback only after a successful route, not a GPS update', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => tree.root.findByType(DriverRoutePolyline).props.onError('Route unavailable'));
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({
    coords: { latitude: 33.89, longitude: 35.5 },
  }));
  expect(text()).toContain('pickupUi.routeUnavailable');
  await act(async () => tree.root.findByType(DriverRoutePolyline).props.onReady([
    { latitude: 33.89, longitude: 35.5 }, { latitude: 33.8938, longitude: 35.5018 },
  ]));
  expect(text()).not.toContain('pickupUi.routeUnavailable');
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
});

test('starts the reserved trip through the existing primary action', async () => {
  await mount('DRIVER_ASSIGNED');
  startReservedPickup.mockResolvedValue({ status: 'DRIVER_GOING_TO_PICKUP' });
  await act(async () => button('pickupUi.startTrip').props.onPress());
  expect(startReservedPickup).toHaveBeenCalledWith('trip-12345678');
  expect(button('pickupUi.confirmPickup')).toBeDefined();
  expect(button('pickupUi.confirmArrival')).toBeUndefined();
  expect(text()).not.toContain('Send Fake Location');
  expect(text()).not.toContain('EXPO_PUBLIC');
});

test('opens pickup details immediately and records arrival within the pickup action', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  expect(button('pickupUi.confirmArrival')).toBeUndefined();
  await act(async () => button('pickupUi.gallery').props.onPress());
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Collected safely'));
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(emitDriverArrivedPickupWithAck).toHaveBeenCalledWith({
    tripId: 'trip-12345678',
    latitude: 33.8938,
    longitude: 35.5018,
  });
  expect(pickupItem).toHaveBeenCalledWith(
    'trip-12345678',
    expect.objectContaining({
      notes: 'Collected safely',
      proofPhotos: [expect.objectContaining({ uri: 'file:///proof.jpg' })],
    }),
  );
  expect(getRecentTripLocation('trip-12345678')).toMatchObject({ latitude: 33.8938, longitude: 35.5018 });
  expect(emitDriverArrivedPickupWithAck.mock.invocationCallOrder[0]).toBeLessThan(
    pickupItem.mock.invocationCallOrder[0],
  );
  expect(mockRouter.replace).toHaveBeenCalledWith(
    { pathname: '/deliver-item', params: mockParams },
  );
});

test('keeps pickup unavailable outside the permitted arrival radius', async () => {
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 34.4367, longitude: 35.8497 },
  });
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(button('pickupUi.confirmPickup').props.disabled).toBe(true);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
});

test('requires proof photos before recording arrival', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(text()).toContain('At least one pickup proof photo is required.');
  expect(emitDriverArrivedPickupWithAck).not.toHaveBeenCalled();
  expect(pickupItem).not.toHaveBeenCalled();
});

test('does not submit pickup if the backend has not confirmed arrival', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => button('pickupUi.gallery').props.onPress());
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(text()).toContain('Failed to send arrival confirmation.');
  expect(pickupItem).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(button('pickupUi.confirmPickup').props.loading).toBe(false);
});

test('continues pickup when arrival was recorded but the socket acknowledgement was lost', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => button('pickupUi.gallery').props.onPress());
  emitDriverArrivedPickupWithAck.mockRejectedValueOnce(new Error('Timed out'));
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(pickupItem).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/deliver-item' }),
  );
});

test('continues on the server status event without waiting for a missing socket acknowledgement', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => button('pickupUi.gallery').props.onPress());
  emitDriverArrivedPickupWithAck.mockImplementationOnce(() => {
    onTripStatusUpdated.mock.calls[0][0]({
      tripId: 'trip-12345678',
      status: 'DRIVER_ARRIVED_PICKUP',
    });
    return new Promise(() => {});
  });
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(pickupItem).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/deliver-item' }),
  );
});

test('retries failed proof upload without recording arrival again', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => button('pickupUi.gallery').props.onPress());
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  pickupItem.mockRejectedValueOnce(new Error('Upload failed'));
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(text()).toContain('Upload failed');
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(emitDriverArrivedPickupWithAck).toHaveBeenCalledTimes(1);
  expect(pickupItem).toHaveBeenCalledTimes(2);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/deliver-item' }),
  );
});

test('requires a proof photo and submits it with notes before opening delivery', async () => {
  await mount('DRIVER_ARRIVED_PICKUP');
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(text()).toContain('At least one pickup proof photo is required.');
  expect(pickupItem).not.toHaveBeenCalled();
  await act(async () => button('pickupUi.gallery').props.onPress());
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Collected safely'));
  pickupItem.mockResolvedValue({ status: 'ITEM_PICKED_UP' });
  await act(async () => button('pickupUi.confirmPickup').props.onPress());
  expect(pickupItem).toHaveBeenCalledWith(
    'trip-12345678',
    expect.objectContaining({
      notes: 'Collected safely',
      proofPhotos: [expect.objectContaining({ uri: 'file:///proof.jpg' })],
    }),
  );
  expect(emitDriverArrivedPickupWithAck).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/deliver-item',
      params: expect.objectContaining({ tripId: 'trip-12345678' }),
    }),
  );
});


test('frames the driver and pickup without waiting for directions, including when routing fails', async () => {
  const driver = { latitude: 33.8938, longitude: 35.48 };
  Location.getCurrentPositionAsync.mockResolvedValueOnce({ coords: driver });
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => tree.root.findByType('MapView').props.onMapReady());
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver),
    expect.objectContaining({ latitude: 33.8938, longitude: 35.5018 }),
  ]), expect.objectContaining({ edgePadding: { top: 112, right: 40, bottom: 80, left: 40 } }));
  await act(async () => tree.root.findByType(DriverRoutePolyline).props.onError('Offline'));
  mockFit.mockClear();
  await act(async () => tree.root.findByType('MapView').props.onLayout());
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver),
    expect.objectContaining({ latitude: 33.8938, longitude: 35.5018 }),
  ]), expect.any(Object));
});

test('frames pickup with the first late GPS fix but does not recenter on every GPS update', async () => {
  let finishLocation;
  Location.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(resolve => { finishLocation = resolve; }));
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => tree.root.findByType('MapView').props.onMapReady());
  mockFit.mockClear();
  const driver = { latitude: 33.8938, longitude: 35.48 };
  await act(async () => finishLocation({ coords: driver }));
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver),
    expect.objectContaining({ latitude: 33.8938, longitude: 35.5018 }),
  ]), expect.any(Object));
  mockFit.mockClear();
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: { ...driver, longitude: 35.481 } }));
  expect(mockFit).not.toHaveBeenCalled();
});

test('includes the pickup pin even when road directions stop short of the address', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  await act(async () => tree.root.findByType('MapView').props.onMapReady());
  mockFit.mockClear();
  const roadRoute = [{ latitude: 33.88, longitude: 35.48 }, { latitude: 33.89, longitude: 35.49 }];
  await act(async () => tree.root.findByType(DriverRoutePolyline).props.onReady(roadRoute));
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    ...roadRoute,
    expect.objectContaining({ latitude: 33.8938, longitude: 35.5018 }),
  ]), expect.any(Object));
});
