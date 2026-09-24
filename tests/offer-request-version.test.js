import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import SendPriceOffer from '../src/app/send-price-offer';
import { ApiResponseError, getDriverRequestDetails, sendDriverPriceOffer } from '@/lib/api';

const mockRouter = { replace: jest.fn() };
const mockParams = { requestId: 'request', requestVersion: 'viewed-version' };
const mockT = key => key;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { countryCode: 'DE' }, signOut: jest.fn() }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: e => e.message }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: async () => ({}) }));
jest.mock('@/lib/api', () => ({
  getDriverRequestDetails: jest.fn(),
  sendDriverPriceOffer: jest.fn(),
  ApiResponseError: class extends Error {
    constructor(message, status, sourceMessage, code) { super(message); this.status = status; this.code = code; }
  },
}));
let tree;
beforeEach(() => { jest.useFakeTimers(); jest.resetAllMocks(); getDriverRequestDetails.mockResolvedValue({ currency: 'CHF' }); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
function submitButton() {
  return tree.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.findAllByType(Text).some(text => text.props.children === 'Submit Offer'));
}
async function submit(price = '100') {
  await act(async () => { tree = create(<SendPriceOffer />); });
  await act(async () => { tree.root.findAllByType(TextInput)[0].props.onChangeText(price); });
  await act(async () => { submitButton().props.onPress(); });
}
it('submits the version carried from the viewed details', async () => {
  sendDriverPriceOffer.mockResolvedValue({ request: { id: 'request', status: 'QUOTED' }, offer: { id: 'offer' } });
  await submit();
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request', { requestVersion: 'viewed-version', price: 100, currency: 'CHF' });
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/offer-waiting-response', params: { requestId: 'request', status: 'QUOTED', offerId: 'offer' } });
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('returns to details and alerts the driver when the client changed them', async () => {
  sendDriverPriceOffer.mockRejectedValue(new ApiResponseError('Changed', 409, 'Changed', 'REQUEST_DETAILS_CHANGED'));
  await submit();
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/review-request-details', params: { requestId: 'request' } });
  expect(Alert.alert).toHaveBeenCalledWith('Request details changed', 'The client changed one or more details of this job request. Review the updated details before sending an offer.');
});
it('keeps unrelated conflicts on the offer form', async () => {
  sendDriverPriceOffer.mockRejectedValue(new ApiResponseError('Offer already exists', 409));
  await submit();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Offer already exists');
});

it.each(['', 'abc', '0', '100001'])('does not send invalid price %s', async price => {
  await submit(price);
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('sends optional timing and trimmed message with request currency', async () => {
  sendDriverPriceOffer.mockResolvedValue({ request: { id: 'request', status: 'QUOTED' }, offer: { id: 'offer' } });
  await act(async () => { tree = create(<SendPriceOffer />); });
  const pickup = new Date(Date.now() + 3600000).toISOString();
  const delivery = new Date(Date.now() + 7200000).toISOString();
  const values = ['125.50', pickup, delivery, '60', '  Handle carefully  '];
  for (let index = 0; index < values.length; index++) {
    await act(async () => tree.root.findAllByType(TextInput)[index].props.onChangeText(values[index]));
  }
  await act(async () => submitButton().props.onPress());
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request', {
    requestVersion: 'viewed-version', price: 125.5, currency: 'CHF',
    estimatedPickupAt: pickup, estimatedDeliveryAt: delivery,
    estimatedDurationMinutes: 60, message: 'Handle carefully',
  });
});
it('disables repeat submission while pending and allows retry after a network failure', async () => {
  let reject;
  sendDriverPriceOffer.mockImplementationOnce(() => new Promise((resolve, rejectPromise) => { reject = rejectPromise; }));
  await submit();
  expect(submitButton().props.disabled).toBe(true);
  await act(async () => submitButton().props.onPress());
  expect(sendDriverPriceOffer).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Network unavailable')));
  expect(submitButton().props.disabled).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain('Network unavailable');
  sendDriverPriceOffer.mockResolvedValue({ request: { id: 'request', status: 'QUOTED' }, offer: { id: 'offer' } });
  await act(async () => submitButton().props.onPress());
  expect(sendDriverPriceOffer).toHaveBeenCalledTimes(2);
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/offer-waiting-response', params: { requestId: 'request', status: 'QUOTED', offerId: 'offer' } });
});
