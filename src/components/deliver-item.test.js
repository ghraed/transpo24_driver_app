import { getRecentTripLocation } from '@/location/trip-location-cache';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { BackHandler, Text, TextInput } from 'react-native';
import * as Location from 'expo-location';
import DeliverItemScreen from '@/app/deliver-item';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { deliverItem, startDelivery } from '@/services/tripService';
import { DriverRoutePolyline } from './driver-route-polyline';
import { NavigationCameraToggle } from './navigation-camera-toggle';
import { MapLocationMarker } from './map-location-marker';
import { DriverButton, DriverPageHeader } from './ui/driver-ui';

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
const mockFit = jest.fn();
const mockAnimateCamera = jest.fn();
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
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
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
    isNativeMapRuntimeAvailable: false,
    NativeMarker: 'Marker',
    NativeMapView: React.forwardRef(function MockMap(props, ref) {
      React.useImperativeHandle(ref, () => ({ fitToCoordinates: mockFit, animateCamera: mockAnimateCamera, getCamera: async () => ({ pitch: 0, heading: 0, zoom: 14 }) }));
      return React.createElement('MapView', props, props.children);
    }),
  };
});
jest.mock('@/components/driver-chat-button', () => ({ DriverChatButton: () => null }));
jest.mock('@/components/driver-route-polyline', () => ({ DriverRoutePolyline: () => null }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: '' }));
jest.mock('@/location/trip-location-cache', () => ({ getRecentTripLocation: jest.fn(() => null), rememberTripLocation: jest.fn() }));
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
jest.mock('@/localization/response-message', () => ({
  getSourceErrorMessage: (error, fallback) => error?.sourceMessage ?? error?.message ?? fallback,
}));
jest.mock('@/services/tripService', () => ({ deliverItem: jest.fn(), startDelivery: jest.fn() }));
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
  onItemDelivered: jest.fn(() => jest.fn()),
  onSocketDisconnect: jest.fn(() => jest.fn()),
  onSocketError: jest.fn(() => jest.fn()),
  onTripStatusUpdated: jest.fn(() => jest.fn()),
}));
let tree;
let hardwareBack;
let removeBackListener;
const text = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');
const button = (label) =>
  tree.root.findAllByType(DriverButton).find((node) => node.props.label === label);
async function mount(status = 'DRIVER_GOING_TO_DROPOFF') {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: status });
  await act(async () => {
    tree = create(<DeliverItemScreen />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  getRecentTripLocation.mockReturnValue(null);
  jest.requireMock('@/components/native-maps').isNativeMapRuntimeAvailable = false;
  jest.requireMock('@/config/maps').GOOGLE_MAPS_API_KEY = '';
  mockRouter.canGoBack.mockReturnValue(true);
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 34.4367, longitude: 35.8497 },
  });
  startDelivery.mockResolvedValue({ status: 'DRIVER_GOING_TO_DROPOFF' });
  removeBackListener = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
    hardwareBack = handler;
    return { remove: removeBackListener };
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

test('header back returns to history rather than Settings', async () => {
  await mount();
  await act(async () => tree.root.findByType(DriverPageHeader).props.onBack());
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('uses Accepted Jobs when opened without navigation history', async () => {
  mockRouter.canGoBack.mockReturnValue(false);
  await mount();
  await act(async () => tree.root.findByType(DriverPageHeader).props.onBack());
  expect(mockRouter.replace).toHaveBeenCalledWith('/accepted-jobs');
});

test('hardware back closes the expanded map before leaving the page', async () => {
  await mount();
  const expand = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'pickupUi.expandMap' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => expand.props.onPress());
  expect(tree.root.findAllByType(DriverPageHeader)).toHaveLength(0);
  await act(async () => hardwareBack());
  expect(tree.root.findAllByType(DriverPageHeader)).toHaveLength(1);
  expect(mockRouter.back).not.toHaveBeenCalled();
  await act(async () => hardwareBack());
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('keeps delivery disabled outside the permitted radius', async () => {
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 33.8938, longitude: 35.5018 },
  });
  await mount();
  expect(button('deliveryUi.confirmAction').props.disabled).toBe(true);
  expect(text()).not.toContain('Send Fake Location');
  expect(text()).not.toContain('EXPO_PUBLIC');
});

test('requires photos and completes delivery with the existing API and route', async () => {
  await mount();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  await act(async () => button('deliveryUi.confirmAction').props.onPress());
  expect(text()).toContain('At least one delivery proof photo is required.');
  expect(deliverItem).not.toHaveBeenCalled();
  await act(async () => button('pickupUi.gallery').props.onPress());
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Handed to recipient'));
  deliverItem.mockResolvedValue({ deliveredAt: '2026-10-21T12:00:00Z' });
  await act(async () => button('deliveryUi.confirmAction').props.onPress());
  expect(deliverItem).toHaveBeenCalledWith(
    'trip-12345678',
    expect.objectContaining({
      notes: 'Handed to recipient',
      proofPhotos: [expect.objectContaining({ uri: 'file:///proof.jpg' })],
      latitude: 34.4367,
      longitude: 35.8497,
    }),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/driver-trip-completed',
    params: { tripId: 'trip-12345678', deliveredAt: '2026-10-21T12:00:00Z' },
  });
});

test('keeps the pickup prerequisite and route parameters intact', async () => {
  await mount('DRIVER_ARRIVED_PICKUP');
  expect(text()).toContain('Pickup must be confirmed and saved before opening delivery.');
  expect(startDelivery).not.toHaveBeenCalled();
  await act(async () => button('Go to Pickup Location').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/go-to-pickup',
    params: mockParams,
  });
});


function enableMap() {
  jest.requireMock('@/components/native-maps').isNativeMapRuntimeAvailable = true;
  jest.requireMock('@/config/maps').GOOGLE_MAPS_API_KEY = 'native-map-key';
}

test('after pickup confirmation, delivery routes from the live driver location to dropoff', async () => {
  enableMap();
  const driver = { latitude: 33.8938, longitude: 35.5018 };
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: driver });
  await mount('ITEM_PICKED_UP');
  expect(startDelivery).toHaveBeenCalledWith('trip-12345678');
  expect(tree.root.findByType(DriverRoutePolyline).props).toMatchObject({
    origin: driver,
    destination: { latitude: 34.4367, longitude: 35.8497 },
    strokeColor: '#2563EB',
  });
  const markers = tree.root.findAllByType(MapLocationMarker);
  expect(markers.map(node => node.props.kind)).toEqual(['driver', 'dropoff']);
  expect(markers.find(node => node.props.kind === 'dropoff').props.zIndex).toBe(40);
});

test('GPS updates keep the delivery route component mounted and update its origin', async () => {
  enableMap();
  await mount();
  const route = tree.root.findByType(DriverRoutePolyline);
  const next = { latitude: 34.4, longitude: 35.8 };
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: next }));
  expect(tree.root.findByType(DriverRoutePolyline)).toBe(route);
  expect(route.props.origin).toMatchObject(next);
  expect(route.props.destination).toMatchObject({ latitude: 34.4367, longitude: 35.8497 });
});

test.each([true, false])('frames the whole delivery road route regardless of readiness order (route first: %s)', async routeFirst => {
  enableMap();
  const driver = { latitude: 33.8938, longitude: 35.5018 };
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: driver });
  await mount();
  const roadRoute = [driver, { latitude: 34.0, longitude: 35.9 }, { latitude: 34.436, longitude: 35.849 }];
  const ready = () => tree.root.findByType(DriverRoutePolyline).props.onReady(roadRoute);
  const mapReady = () => tree.root.findByType('MapView').props.onMapReady();
  await act(async () => { if (routeFirst) ready(); else mapReady(); });
  if (routeFirst) expect(mockFit).not.toHaveBeenCalled();
  else expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver),
    expect.objectContaining({ latitude: 34.4367, longitude: 35.8497 }),
  ]), expect.any(Object));
  await act(async () => { if (routeFirst) mapReady(); else ready(); });
  expect(mockFit).toHaveBeenLastCalledWith(expect.arrayContaining([
    ...roadRoute,
    expect.objectContaining({ latitude: 34.4367, longitude: 35.8497 }),
  ]), expect.any(Object));
  mockFit.mockClear();
  await act(async () => tree.root.findByType(NavigationCameraToggle).props.onPress());
  await act(async () => ready());
  expect(mockFit).not.toHaveBeenCalled();
});

test('fits a late GPS fix with dropoff without repeated recentering during delivery', async () => {
  enableMap();
  let finish;
  const location = new Promise(resolve => { finish = resolve; });
  Location.getCurrentPositionAsync.mockReturnValue(location);
  await mount();
  await act(async () => tree.root.findByType('MapView').props.onMapReady());
  mockFit.mockClear();
  const driver = { latitude: 33.8938, longitude: 35.5018 };
  await act(async () => finish({ coords: driver }));
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver),
    expect.objectContaining({ latitude: 34.4367, longitude: 35.8497 }),
  ]), expect.any(Object));
  mockFit.mockClear();
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: { ...driver, latitude: 33.9 } }));
  expect(mockFit).not.toHaveBeenCalled();
});


test('shows pickup handoff GPS and destination while a fresh fix is pending, and starts watching immediately', async () => {
  enableMap();
  const driver = { latitude: 33.8938, longitude: 35.5018 };
  getRecentTripLocation.mockReturnValue(driver);
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
  await mount('ITEM_PICKED_UP');
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(startDelivery).toHaveBeenCalledTimes(1);
  const markers = tree.root.findAllByType(MapLocationMarker);
  expect(markers.find(node => node.props.kind === 'driver').props.coordinate).toEqual(driver);
  expect(markers.find(node => node.props.kind === 'dropoff').props.coordinate).toMatchObject({ latitude: 34.4367, longitude: 35.8497 });
  await act(async () => tree.root.findByType('MapView').props.onMapReady());
  expect(mockFit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining(driver), expect.objectContaining({ latitude: 34.4367, longitude: 35.8497 }),
  ]), expect.any(Object));
  const live = { latitude: 34.0, longitude: 35.6 };
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: live }));
  expect(tree.root.findAllByType(MapLocationMarker).find(node => node.props.kind === 'driver').props.coordinate).toMatchObject(live);
});

test('a live GPS update beats an older pending initial fix', async () => {
  enableMap();
  let finish;
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  const live = { latitude: 34.0, longitude: 35.6 };
  await act(async () => Location.watchPositionAsync.mock.calls[0][1]({ coords: live }));
  await act(async () => finish({ coords: { latitude: 33.8938, longitude: 35.5018 } }));
  expect(tree.root.findAllByType(MapLocationMarker).find(node => node.props.kind === 'driver').props.coordinate).toMatchObject(live);
});


test('still displays a fresh driver fix if the GPS watcher fails to start', async () => {
  enableMap();
  Location.watchPositionAsync.mockRejectedValueOnce(new Error('Watcher unavailable'));
  await mount();
  expect(tree.root.findAllByType(MapLocationMarker).find(node => node.props.kind === 'driver').props.coordinate).toMatchObject({ latitude: 34.4367, longitude: 35.8497 });
  expect(tree.root.findAllByType(MapLocationMarker).find(node => node.props.kind === 'dropoff')).toBeDefined();
});


test('does not turn missing dropoff coordinates into a marker at zero', async () => {
  enableMap();
  const previous = mockParams.dropoffLatitude;
  mockParams.dropoffLatitude = ' ';
  try {
    await mount();
    expect(text()).toContain('Invalid trip data. Please reopen this trip from Accepted Jobs.');
    expect(tree.root.findAllByType(MapLocationMarker)).toHaveLength(0);
    expect(startDelivery).not.toHaveBeenCalled();
  } finally {
    mockParams.dropoffLatitude = previous;
  }
});
