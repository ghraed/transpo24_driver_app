import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Pickup from '../src/app/go-to-pickup';
import Delivery from '../src/app/deliver-item';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { pickupItem, deliverItem, startDelivery } from '@/services/tripService';
import { stopBackgroundTripTracking } from '@/location/background-trip-tracking';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockT = key => key;
const mockParams = { tripId: 'swiss-job', pickupLatitude: '46.2', pickupLongitude: '6.1', pickupAddress: 'Geneva', dropoffLatitude: '46.5', dropoffLongitude: '6.6', dropoffAddress: 'Lausanne' };
jest.mock('expo-router', () => ({ Stack: { Screen: 'Screen' }, useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', driver: { countryCode: 'FR' } }) }));
jest.mock('@/lib/api', () => ({ getDriverAcceptedJobDetails: jest.fn() }));
jest.mock('@/services/tripService', () => ({ pickupItem: jest.fn(), deliverItem: jest.fn(), startDelivery: jest.fn() }));
jest.mock('@/services/socketService', () => ({
  connectSocket: jest.fn(), joinTripRoom: jest.fn(), leaveTripRoom: jest.fn(), emitDriverLocationUpdate: jest.fn(), emitDriverArrivedPickupWithAck: jest.fn(),
  onDriverArrivedPickupConfirmed: jest.fn(() => jest.fn()), onItemPickedUp: jest.fn(() => jest.fn()), onSocketDisconnect: jest.fn(() => jest.fn()), onSocketError: jest.fn(() => jest.fn()), onTripStatusUpdated: jest.fn(() => jest.fn()), onItemDelivered: jest.fn(() => jest.fn()),
}));
jest.mock('@/location/background-trip-tracking', () => ({ startBackgroundTripTracking: jest.fn(), stopBackgroundTripTracking: jest.fn() }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/components/driver-chat-button', () => ({ DriverChatButton: 'DriverChatButton' }));
jest.mock('@/components/driver-route-polyline', () => ({ DriverRoutePolyline: 'DriverRoutePolyline' }));
jest.mock('@/components/native-maps', () => ({ isNativeMapRuntimeAvailable: false }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: '' }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn() }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: error => error.message }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image-picker', () => ({ PermissionStatus: { GRANTED: 'granted' }, requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4, Highest: 6 }, getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const photo = { uri: 'file:///proof.jpg', fileName: 'proof.jpg', mimeType: 'image/jpeg', width: 800, height: 600 };
let tree;
const output = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(text => text.props.children === label));
async function press(label) { expect(button(label).props.disabled).not.toBe(true); await act(async () => button(label).props.onPress()); }
async function render(Screen) { await act(async () => { tree = create(<Screen />); }); }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [photo] });
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [photo] });
  stopBackgroundTripTracking.mockResolvedValue(undefined);
  require('@/location/background-trip-tracking').startBackgroundTripTracking.mockResolvedValue(true);
  pickupItem.mockResolvedValue({ status: 'ITEM_PICKED_UP' });
  deliverItem.mockResolvedValue({ deliveredAt: '2026-09-24T12:00:00Z' });
  startDelivery.mockResolvedValue({ status: 'DRIVER_GOING_TO_DROPOFF' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });

describe.each([
  ['pickup', Pickup, 'DRIVER_ARRIVED_PICKUP', 'Submit Pickup', pickupItem, { latitude: 46.2, longitude: 6.1 }],
  ['delivery', Delivery, 'DRIVER_GOING_TO_DROPOFF', 'Submit Delivery', deliverItem, { latitude: 46.5, longitude: 6.6 }],
])('%s confirmation', (phase, Screen, status, label, submit, coordinates) => {
  beforeEach(() => {
    getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: status });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: coordinates });
  });
  it('submits proof and trimmed notes for the authorized foreign job and advances only on success', async () => {
    await render(Screen); await press('Choose Images');
    await act(async () => tree.root.findByType(TextInput).props.onChangeText(' Proof recorded '));
    await press(label);
    expect(getDriverAcceptedJobDetails).toHaveBeenCalledWith('swiss-job');
    expect(submit).toHaveBeenCalledWith('swiss-job', { ...coordinates, notes: 'Proof recorded', proofPhotos: [photo] });
    expect(mockRouter.replace).toHaveBeenCalledWith(phase === 'pickup'
      ? { pathname: '/deliver-item', params: mockParams }
      : { pathname: '/driver-trip-completed', params: { tripId: 'swiss-job', deliveredAt: '2026-09-24T12:00:00Z' } });
    if (phase === 'delivery') expect(stopBackgroundTripTracking).toHaveBeenCalledWith('swiss-job');
  });
  it('requires proof and requires it again after clearing photos', async () => {
    await render(Screen); await press(label);
    expect(output()).toContain(`At least one ${phase} proof photo is required.`);
    await press('Take Photo'); await press('Clear All'); await press(label);
    expect(submit).not.toHaveBeenCalled();
  });
  it('preserves proof on server denial and permits an explicit retry', async () => {
    submit.mockRejectedValueOnce(new Error('Request access denied'));
    await render(Screen); await press('Choose Images'); await press(label);
    expect(output()).toContain('Request access denied'); expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(button('Clear All')).toBeDefined();
    await press(label); expect(submit).toHaveBeenCalledTimes(2); expect(mockRouter.replace).toHaveBeenCalled();
  });
  it('disables confirmation while upload is pending', async () => {
    let resolveUpload;
    submit.mockImplementationOnce(() => new Promise(resolve => { resolveUpload = resolve; }));
    await render(Screen); await press('Take Photo'); await press(label);
    expect(button(phase === 'pickup' ? 'Submitting Pickup...' : 'Submitting Delivery...').props.disabled).toBe(true);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await act(async () => resolveUpload({ status: 'ITEM_PICKED_UP', deliveredAt: '2026-09-24T12:00:00Z' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['Take Photo', ImagePicker.requestCameraPermissionsAsync, ImagePicker.launchCameraAsync],
    ['Choose Images', ImagePicker.requestMediaLibraryPermissionsAsync, ImagePicker.launchImageLibraryAsync],
  ])('handles denied permission for %s', async (action, permission, launch) => {
    permission.mockResolvedValue({ status: 'denied' });
    await render(Screen); await press(action);
    expect(launch).not.toHaveBeenCalled(); expect(output()).toContain('permission is required');
    expect(button('Clear All')).toBeUndefined();
  });
  it('does not authorize actions or start tracking when the accepted-job reload is denied', async () => {
    getDriverAcceptedJobDetails.mockRejectedValueOnce(new Error('Request access denied'));
    await render(Screen);
    expect(output()).toContain('Request access denied');
    expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(startDelivery).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled(); expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

it('blocks delivery before pickup has been confirmed by the server', async () => {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  await render(Delivery);
  expect(output()).toContain('Pickup must be confirmed and saved before opening delivery.');
  expect(button('Submit Delivery')).toBeUndefined();
  expect(startDelivery).not.toHaveBeenCalled(); expect(deliverItem).not.toHaveBeenCalled();
});
it('starts delivery for the exact picked-up job before confirmation', async () => {
  getDriverAcceptedJobDetails.mockResolvedValueOnce({ requestStatus: 'ITEM_PICKED_UP' }).mockResolvedValue({ requestStatus: 'DRIVER_GOING_TO_DROPOFF' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.5, longitude: 6.6 } });
  await render(Delivery); await press('Take Photo'); await press('Submit Delivery');
  expect(startDelivery).toHaveBeenCalledWith('swiss-job');
  expect(deliverItem).toHaveBeenCalledTimes(1);
  expect(startDelivery.mock.invocationCallOrder[0]).toBeLessThan(deliverItem.mock.invocationCallOrder[0]);
});
it('rechecks fresh delivery coordinates before uploading proof', async () => {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_GOING_TO_DROPOFF' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.5, longitude: 6.6 } });
  await render(Delivery); await press('Take Photo');
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 48.8, longitude: 2.3 } });
  await press('Submit Delivery');
  expect(output()).toContain('You are too far from dropoff location. Move closer to continue.');
  expect(deliverItem).not.toHaveBeenCalled(); expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('does not advance pickup when the backend has not confirmed a delivery-phase status', async () => {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_ARRIVED_PICKUP' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.2, longitude: 6.1 } });
  pickupItem.mockResolvedValueOnce({ status: 'DRIVER_ARRIVED_PICKUP' });
  await render(Pickup); await press('Take Photo'); await press('Submit Pickup');
  expect(output()).toContain('Unexpected pickup status returned by backend.');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

describe('arrival socket confirmation', () => {
  const socket = require('@/services/socketService');
  beforeEach(() => {
    getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_GOING_TO_PICKUP' });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.2, longitude: 6.1 } });
    socket.emitDriverArrivedPickupWithAck.mockResolvedValue(undefined);
  });
  it('waits for confirmation for this job and ignores other jobs before enabling pickup', async () => {
    await render(Pickup); await press('Mark Arrived at Pickup');
    expect(socket.emitDriverArrivedPickupWithAck).toHaveBeenCalledWith({ tripId: 'swiss-job', latitude: 46.2, longitude: 6.1 });
    expect(button('Marking Arrival...').props.disabled).toBe(true);
    const receive = socket.onDriverArrivedPickupConfirmed.mock.calls.at(-1)[0];
    const event = { tripId: 'other-job', driverId: 'french-driver', status: 'DRIVER_ARRIVED_PICKUP', arrivedAt: '2026-09-24T12:00:00Z' };
    await act(async () => receive(event));
    expect(button('Submit Pickup')).toBeUndefined();
    await act(async () => receive({ ...event, tripId: 'swiss-job' }));
    expect(button('Submit Pickup').props.disabled).toBe(false);
    expect(pickupItem).not.toHaveBeenCalled();
  });
  it('recovers after arrival acknowledgement fails without enabling pickup', async () => {
    socket.emitDriverArrivedPickupWithAck.mockRejectedValueOnce(new Error('Arrival denied'));
    await render(Pickup); await press('Mark Arrived at Pickup');
    expect(output()).toContain('Arrival denied'); expect(button('Submit Pickup')).toBeUndefined();
    await press('Mark Arrived at Pickup');
    expect(socket.emitDriverArrivedPickupWithAck).toHaveBeenCalledTimes(2);
    expect(button('Marking Arrival...').props.disabled).toBe(true);
  });
  it('ignores pickup events for unrelated jobs', async () => {
    await render(Pickup);
    const receive = socket.onItemPickedUp.mock.calls.at(-1)[0];
    await act(async () => receive({ tripId: 'other-job' }));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await act(async () => receive({ tripId: 'swiss-job' }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/deliver-item', params: mockParams });
  });
});

describe.each([
  ['pickup', Pickup, 'DRIVER_ARRIVED_PICKUP', ['onDriverArrivedPickupConfirmed', 'onItemPickedUp', 'onSocketDisconnect', 'onSocketError', 'onTripStatusUpdated']],
  ['delivery', Delivery, 'DRIVER_GOING_TO_DROPOFF', ['onTripStatusUpdated', 'onItemDelivered']],
])('%s socket cleanup', (phase, Screen, status, names) => {
  it.each(['denied', 'pending', 'granted'])('removes all listeners after unmount with %s location permission', async permissionState => {
    const socket = require('@/services/socketService');
    getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: status });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.5, longitude: 6.6 } });
    let resolvePermission;
    if (permissionState === 'denied') Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    else if (permissionState === 'pending') Location.requestForegroundPermissionsAsync.mockImplementation(() => new Promise(resolve => { resolvePermission = resolve; }));
    await render(Screen);
    const subscriptions = names.flatMap(name => socket[name].mock.results.map(result => result.value));
    const staleEvent = socket[phase === 'pickup' ? 'onItemPickedUp' : 'onItemDelivered'].mock.calls.at(-1)[0];
    expect(subscriptions.length).toBeGreaterThan(0);
    await act(async () => tree.unmount()); tree = null;
    if (resolvePermission) await act(async () => resolvePermission({ status: 'granted' }));
    subscriptions.forEach(unsubscribe => expect(unsubscribe).toHaveBeenCalledTimes(1));
    await act(async () => staleEvent({ tripId: 'swiss-job', deliveredAt: '2026-09-24T12:00:00Z' }));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

it('does not start delivery twice while the initial transition is pending', async () => {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'ITEM_PICKED_UP' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 46.5, longitude: 6.6 } });
  const completions = [];
  startDelivery.mockImplementation(() => new Promise(resolve => completions.push(resolve)));
  await render(Delivery);
  const startsWhilePending = startDelivery.mock.calls.length;
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_GOING_TO_DROPOFF' });
  await act(async () => completions.forEach(resolve => resolve({ status: 'DRIVER_GOING_TO_DROPOFF' })));
  expect(startsWhilePending).toBe(1);
  expect(output()).not.toContain('Trip status must be ITEM_PICKED_UP');
});
