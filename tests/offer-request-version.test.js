import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import SendPriceOffer from '../src/app/send-price-offer';
import { ApiResponseError, sendDriverPriceOffer } from '@/lib/api';

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
  sendDriverPriceOffer: jest.fn(),
  ApiResponseError: class extends Error {
    constructor(message, status, sourceMessage, code) { super(message); this.status = status; this.code = code; }
  },
}));
let tree;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function submit() {
  await act(async () => { tree = create(<SendPriceOffer />); });
  await act(async () => { tree.root.findAllByType(TextInput)[0].props.onChangeText('100'); });
  await act(async () => { tree.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
}
it('submits the version carried from the viewed details', async () => {
  sendDriverPriceOffer.mockResolvedValue({ request: { id: 'request', status: 'QUOTED' }, offer: { id: 'offer' } });
  await submit();
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request', expect.objectContaining({ requestVersion: 'viewed-version' }));
  expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/offer-waiting-response' }));
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
