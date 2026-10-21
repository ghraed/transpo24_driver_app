import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import GoToPickupScreen from '@/app/go-to-pickup';
import { getDriverAcceptedJobDetails, startReservedPickup } from '@/lib/api';
import { emitDriverArrivedPickupWithAck, onTripStatusUpdated } from '@/services/socketService';
import { pickupItem } from '@/services/tripService';
import { DriverButton } from './ui/driver-ui';

const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
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
jest.mock('@/components/native-maps', () => ({ isNativeMapRuntimeAvailable: false }));
jest.mock('@/components/driver-chat-button', () => ({ DriverChatButton: () => null }));
jest.mock('@/components/driver-route-polyline', () => ({ DriverRoutePolyline: () => null }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: '' }));
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
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 33.8938, longitude: 35.5018 },
  });
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
  expect(button('pickupUi.confirmArrival')).toBeDefined();
  expect(text()).not.toContain('Send Fake Location');
  expect(text()).not.toContain('EXPO_PUBLIC');
});

test('sends arrival and opens pickup details on the confirmed trip update', async () => {
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await act(async () => button('pickupUi.confirmArrival').props.onPress());
  expect(emitDriverArrivedPickupWithAck).toHaveBeenCalledWith({
    tripId: 'trip-12345678',
    latitude: 33.8938,
    longitude: 35.5018,
  });
  await act(async () =>
    onTripStatusUpdated.mock.calls[0][0]({
      tripId: 'trip-12345678',
      status: 'DRIVER_ARRIVED_PICKUP',
    }),
  );
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  expect(button('pickupUi.confirmPickup')).toBeDefined();
});

test('keeps arrival unavailable outside the permitted radius', async () => {
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 34.4367, longitude: 35.8497 },
  });
  await mount('DRIVER_GOING_TO_PICKUP');
  expect(button('pickupUi.confirmArrival').props.disabled).toBe(true);
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
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/deliver-item',
      params: expect.objectContaining({ tripId: 'trip-12345678' }),
    }),
  );
});
