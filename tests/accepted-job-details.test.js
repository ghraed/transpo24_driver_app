import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import Screen from '../src/app/accepted-job-details';
import { getDriverAcceptedJobDetails } from '@/lib/api';
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockSignOut = jest.fn();
const mockT = key => key;
let mockRequestId = 'swiss-job';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ requestId: mockRequestId }), useFocusEffect: callback => { require('react').useEffect(callback, [callback]); } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { countryCode: 'FR' }, signOut: mockSignOut }) }));
jest.mock('@/lib/api', () => ({ getDriverAcceptedJobDetails: jest.fn() }));
jest.mock('@/components/request-documents', () => ({ RequestDocuments: 'RequestDocuments' }));
jest.mock('@/components/transported-vehicle-card', () => ({ TransportedVehicleCard: 'TransportedVehicleCard' }));
jest.mock('@/components/driver-chat-button', () => ({ DriverChatButton: 'DriverChatButton' }));
jest.mock('@/components/driver-payout-status-card', () => ({ DriverPayoutStatusCard: 'DriverPayoutStatusCard' }));
jest.mock('@/components/native-maps', () => ({ isNativeMapRuntimeAvailable: false }));
jest.mock('@/config/backend', () => ({ resolveBackendAssetUrl: value => value }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn() }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: error => error.message }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
const details = {
  requestId: 'swiss-job', requestStatus: 'DRIVER_ASSIGNED',
  pickup: { address: 'Geneva', latitude: 46.2, longitude: 6.1 },
  dropoff: { address: 'Lausanne', latitude: 46.5, longitude: 6.6 },
  acceptedOffer: { price: 100, currency: 'CHF' }, schedule: { isImmediate: true },
  item: { title: 'Parcel' }, itemDetails: { dimensions: {}, weightKg: null }, photos: [],
};
let tree;
const output = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(text => text.props.children === label));
async function render() { await act(async () => { tree = create(<Screen />); }); }
beforeEach(() => { jest.useFakeTimers(); jest.resetAllMocks(); mockRequestId = 'swiss-job'; getDriverAcceptedJobDetails.mockResolvedValue(details); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
it.each([
  ['ACCEPTED', 'Go to Pickup Location', '/go-to-pickup'],
  ['DRIVER_ASSIGNED', 'Go to Pickup Location', '/go-to-pickup'],
  ['DRIVER_GOING_TO_PICKUP', 'Go to Pickup Location', '/go-to-pickup'],
  ['DRIVER_ARRIVED_PICKUP', 'Go To Pickup Confirmation', '/go-to-pickup'],
  ['ITEM_PICKED_UP', 'Go to Dropoff Location', '/deliver-item'],
  ['IN_TRANSIT', 'Go to Dropoff Location', '/deliver-item'],
  ['DRIVER_GOING_TO_DROPOFF', 'Go to Dropoff Location', '/deliver-item'],
])('opens the server-authorized foreign job at %s', async (requestStatus, label, pathname) => {
  getDriverAcceptedJobDetails.mockResolvedValue({ ...details, requestStatus });
  await render();
  expect(getDriverAcceptedJobDetails).toHaveBeenCalledWith('swiss-job');
  expect(output()).toContain('CHF');
  expect(button(label).props.disabled).toBe(false);
  await act(async () => button(label).props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname, params: {
    tripId: 'swiss-job', pickupLatitude: '46.2', pickupLongitude: '6.1', pickupAddress: 'Geneva',
    dropoffLatitude: '46.5', dropoffLongitude: '6.6', dropoffAddress: 'Lausanne',
  } });
  await act(async () => button('Additional Expenses').props.onPress());
  expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/trip-expenses', params: { tripId: 'swiss-job' } });
});
it.each(['DELIVERED', 'COMPLETED', 'CANCELLED'])('disables trip actions for %s', async requestStatus => {
  getDriverAcceptedJobDetails.mockResolvedValue({ ...details, requestStatus });
  await render();
  expect(button('Additional Expenses').props.disabled).toBe(true);
  expect(button('Go to Pickup Location').props.disabled).toBe(true);
});
it('recovers from denied access through retry or the accepted jobs list', async () => {
  getDriverAcceptedJobDetails.mockRejectedValueOnce(new Error('Access denied'));
  await render();
  expect(output()).not.toContain('Geneva');
  expect(button('Additional Expenses')).toBeUndefined();
  await act(async () => button('Back to Accepted Jobs').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/accepted-jobs');
  await act(async () => button('Retry').props.onPress());
  expect(output()).toContain('Geneva');
});
it('ignores a prior job response after navigation to a denied job', async () => {
  let resolveOld;
  getDriverAcceptedJobDetails.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render();
  mockRequestId = 'denied-job';
  getDriverAcceptedJobDetails.mockRejectedValueOnce(new Error('Access denied'));
  await act(async () => tree.update(<Screen />));
  await act(async () => resolveOld(details));
  expect(output()).toContain('Access denied');
  expect(output()).not.toContain('Geneva');
  expect(button('Additional Expenses')).toBeUndefined();
});
it('ignores stale authentication failures after leaving the screen', async () => {
  let rejectOld;
  getDriverAcceptedJobDetails.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject; }));
  await render();
  await act(async () => tree.unmount()); tree = null;
  await act(async () => rejectOld(new Error('Unauthorized')));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
