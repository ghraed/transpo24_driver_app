import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import Screen from '@/app/review-request-details';
import { acceptDriverRequestAlert, getDriverRequestDetails } from '@/lib/api';

const mockT = key => key;
const mockRouter = { replace: jest.fn() };
let mockRequestId = 'swiss-job';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ requestId: mockRequestId }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/lib/api', () => ({ getDriverRequestDetails: jest.fn(), acceptDriverRequestAlert: jest.fn() }));
jest.mock('@/components/transported-vehicle-card', () => ({ TransportedVehicleCard: 'TransportedVehicleCard' }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
const details = {
  requestId: 'swiss-job', requestVersion: 'v1', requestStatus: 'PENDING_QUOTES',
  currency: 'CHF', pickupCountryCode: 'CH', destinationCountryCode: 'CH',
  pickup: { address: 'Geneva', latitude: null, longitude: null },
  dropoff: { address: 'Lausanne', latitude: null, longitude: null },
  schedule: { isImmediate: true }, service: { key: 'GOODS', nameEn: 'Goods' },
  itemDetails: { title: 'Parcel', dimensions: { lengthCm: null, widthCm: null, heightCm: null }, weightKg: null },
  photos: [],
};
let tree;
const output = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(text => text.props.children === label));
async function render() {
  await act(async () => { tree = create(<Screen />); });
  await act(async () => jest.runOnlyPendingTimers());
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRequestId = 'swiss-job';
  getDriverRequestDetails.mockResolvedValue(details);
  acceptDriverRequestAlert.mockResolvedValue({ requestId: 'swiss-job', alertId: 'candidate' });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.useRealTimers();
});
it('opens the authorized foreign request and continues to its offer without a tenant filter', async () => {
  await render();
  expect(getDriverRequestDetails).toHaveBeenCalledWith('swiss-job');
  expect(output()).toContain('Geneva');
  expect(output()).toContain('CHF');
  await act(async () => button('Accept & Send Offer').props.onPress());
  expect(acceptDriverRequestAlert).toHaveBeenCalledWith('swiss-job');
  expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/send-price-offer', params: expect.objectContaining({ requestId: 'swiss-job', requestVersion: 'v1' }) }));
});
it('shows a denied deep link with retry and a way back, without an offer action', async () => {
  getDriverRequestDetails.mockRejectedValue(new Error('Request is no longer available.'));
  await render();
  expect(output()).toContain('Request is no longer available.');
  expect(button('Accept & Send Offer')).toBeUndefined();
  await act(async () => button('Back').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/receive-requests');
  getDriverRequestDetails.mockResolvedValue(details);
  await act(async () => button('Retry').props.onPress());
  expect(output()).toContain('Geneva');
});
it('clears stale details after acceptance is denied and requires an authorized reload', async () => {
  await render();
  acceptDriverRequestAlert.mockRejectedValue(new Error('Transport on this route is currently unavailable.'));
  await act(async () => button('Accept & Send Offer').props.onPress());
  expect(output()).not.toContain('Geneva');
  expect(button('Accept & Send Offer')).toBeUndefined();
  expect(output()).toContain('currently unavailable');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('ignores an older request response arriving after navigation to another request', async () => {
  let resolveOld;
  getDriverRequestDetails.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render();
  mockRequestId = 'another-job';
  getDriverRequestDetails.mockRejectedValue(new Error('Access denied.'));
  await act(async () => tree.update(<Screen />));
  await act(async () => jest.runOnlyPendingTimers());
  await act(async () => resolveOld(details));
  expect(output()).toContain('Access denied.');
  expect(output()).not.toContain('Geneva');
});
it('disables new offers for a request no longer open', async () => {
  getDriverRequestDetails.mockResolvedValue({ ...details, requestStatus: 'CANCELLED' });
  await render();
  expect(button('Accept & Send Offer').props.disabled).toBe(true);
  expect(acceptDriverRequestAlert).not.toHaveBeenCalled();
});
