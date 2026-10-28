import React from 'react';
import { act, create } from 'react-test-renderer';
import ReviewRequestDetails from '../src/app/review-request-details';
import { acceptDriverRequestAlert, ApiResponseError, getDriverRequestDetails } from '@/lib/api';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';
import en from '../src/localization/locales/en.json';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockT = (key, options) => key.startsWith('requestEligibility.')
  ? en.requestEligibility[key.split('.')[1]] ?? options?.defaultValue ?? key : key;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ requestId: 'request' }),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/request-route-card', () => ({ RequestRouteCard: () => null }));
jest.mock('@/components/transported-vehicle-card', () => ({ TransportedVehicleCard: () => null }));
jest.mock('@/config/backend', () => ({ resolveBackendAssetUrl: value => value }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: async () => ({}) }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: jest.fn() }));
jest.mock('@/lib/api', () => ({
  getDriverRequestDetails: jest.fn(), acceptDriverRequestAlert: jest.fn(),
  ApiResponseError: class extends Error {
    constructor(message, status, sourceMessage, code) { super(message); this.code = code; }
  },
}));

const details = (reason = null) => ({
  requestId: 'request', requestVersion: 'viewed-version', requestStatus: 'PENDING_QUOTES', offerStatus: null,
  offerEligibility: { canSendOffer: reason === null, reason },
  service: { key: 'GOODS_TRANSPORT', nameEn: 'Goods' },
  pickup: { latitude: 33.89, longitude: 35.5, address: 'Beirut' },
  dropoff: { latitude: 34.43, longitude: 35.84, address: 'Tripoli' },
  schedule: { isImmediate: true, scheduledPickupAt: null },
  itemDetails: { title: 'Goods', type: 'GOODS', weightKg: null, dimensions: { lengthCm: null, widthCm: null, heightCm: null } },
  photos: [],
});
let tree;
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
async function render() {
  await act(async () => { tree = create(<ReviewRequestDetails />); });
  await act(async () => { jest.runOnlyPendingTimers(); });
}
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  syncRequestMatchingLocation.mockResolvedValue();
  getDriverRequestDetails.mockResolvedValue(details());
  acceptDriverRequestAlert.mockResolvedValue({ requestId: 'request', alertId: 'alert' });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; jest.useRealTimers();
});

it('explains a map request restriction before acceptance and offers settings', async () => {
  getDriverRequestDetails.mockResolvedValue(details('OUTSIDE_WORKING_HOURS'));
  await render();
  expect(JSON.stringify(tree.toJSON())).toContain(en.requestEligibility.OUTSIDE_WORKING_HOURS);
  expect(button('Accept & Send Offer').props.disabled).toBe(true);
  expect(acceptDriverRequestAlert).not.toHaveBeenCalled();
  await act(async () => button('Set Availability').props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith('/set-availability');
});

it('rechecks GPS and eligibility, then opens the offer form with the viewed version', async () => {
  getDriverRequestDetails.mockResolvedValueOnce(details('LOCATION_UNAVAILABLE')).mockResolvedValue(details());
  await render();
  await act(async () => button(en.requestEligibility.check).props.onPress());
  expect(button('Accept & Send Offer').props.disabled).toBe(false);
  await act(async () => button('Accept & Send Offer').props.onPress());
  expect(syncRequestMatchingLocation).toHaveBeenCalledTimes(3);
  expect(syncRequestMatchingLocation.mock.invocationCallOrder[2]).toBeLessThan(acceptDriverRequestAlert.mock.invocationCallOrder[0]);
  expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/send-price-offer',
    params: expect.objectContaining({ requestId: 'request', requestVersion: 'viewed-version', alertId: 'alert' }),
  }));
});

it('shows a status card when eligibility changes after details were loaded', async () => {
  acceptDriverRequestAlert.mockRejectedValue(new ApiResponseError('Generic server error', 400, '', 'REQUEST_IMMEDIATE_DISABLED'));
  await render();
  await act(async () => button('Accept & Send Offer').props.onPress());
  expect(button('Accept & Send Offer').props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain(en.requestEligibility.IMMEDIATE_DISABLED);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Generic server error');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('keeps connection failures recoverable', async () => {
  acceptDriverRequestAlert.mockRejectedValue(new Error('Connection unavailable'));
  await render();
  await act(async () => button('Accept & Send Offer').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Connection unavailable');
  expect(button('Accept & Send Offer').props.disabled).toBe(false);
});

it('provides all restriction messages in every supported language', () => {
  for (const language of ['ar', 'de', 'en', 'es', 'fr', 'it']) {
    const catalog = require(`../src/localization/locales/${language}.json`);
    expect(Object.keys(catalog.requestEligibility).sort()).toEqual(Object.keys(en.requestEligibility).sort());
    expect(Object.values(catalog.requestEligibility).every(value => value.trim())).toBe(true);
  }
});
