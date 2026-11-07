import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Platform, Text, TextInput } from 'react-native';
import SendPriceOfferScreen from '@/app/send-price-offer';
import { OfferDateTimeField } from './offer-date-time-field';
import { sendDriverPriceOffer } from '@/lib/api';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';

let mockCountryCode = 'LB';
const mockCurrencyForCountry = (code) => ({ CH: 'CHF', DE: 'EUR', AE: 'AED', SA: 'SAR', QA: 'QAR' }[code] || 'USD');
const mockRouter = { back: jest.fn(), canGoBack: () => true, replace: jest.fn() };
const mockParams = { requestId: 'request-1', requestVersion: 'version-1', serviceName: 'Bicycle transport', pickupAddress: 'Beirut', dropoffAddress: 'Tripoli' };
const mockT = (key, values = {}) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en', resolvedLanguage: 'en', dir: () => 'ltr' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { countryCode: mockCountryCode }, signOut: jest.fn() }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/api', () => ({ sendDriverPriceOffer: jest.fn(), ApiResponseError: class extends Error {} }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: jest.fn(async () => {}) }));
jest.mock('@/lib/country-currency', () => ({ currencyForCountryCode: code => mockCurrencyForCountry(code), getCountryLabel: () => 'Lebanon' }));
jest.mock('@/localization/format', () => ({ formatDateTime: value => value, formatCurrency: (amount, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount) }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn(async () => ({})) }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: (error, fallback) => error?.message || fallback }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

const originalPlatform = Platform.OS;
let tree;
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');
async function mount() { await act(async () => { tree = create(<SendPriceOfferScreen />); }); }
async function press(label) {
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0]
    || tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(child => child.props.children === label))[0];
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}
async function enter(label, value) {
  await act(async () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label).props.onChangeText(value));
}
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  mockCountryCode = 'LB';
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  sendDriverPriceOffer.mockResolvedValue({ request: { id: 'request-1', status: 'QUOTED' }, offer: { id: 'offer-1' } });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = undefined; Platform.OS = originalPlatform; });

test('discloses platform responsibility for Stripe fees even before a price is entered', async () => {
  await mount();
  expect(texts()).toContain('The platform covers Stripe processing fees.');
  expect(texts()).toContain('Stripe payment-processing fees are paid from the platform commission and do not reduce your earnings.');
  expect(texts()).toContain('After platform fee');
  expect(texts()).not.toContain('You receive');
  expect(texts()).toContain('Enter a price to preview your earnings.');
});

test('previews the 15% platform deduction without inventing a Stripe fee', async () => {
  await mount();
  await enter('Price *', '450');
  expect(texts()).toContain('$382.50');
  expect(texts()).toContain('−$67.50');
  expect(texts()).toContain('Platform fee (15%)');
  expect(texts()).toContain('After platform fee');
});

test('submits the original offer and request version, with optional fields omitted', async () => {
  await mount();
  await enter('Price *', '450');
  await enter('Message (optional)', '  Call at the gate  ');
  await press('Submit Offer');
  expect(syncRequestMatchingLocation).toHaveBeenCalledTimes(1);
  expect(syncRequestMatchingLocation.mock.invocationCallOrder[0]).toBeLessThan(sendDriverPriceOffer.mock.invocationCallOrder[0]);
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request-1', { price: 450, currency: 'USD', requestVersion: 'version-1', message: 'Call at the gate' });
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/offer-waiting-response', params: { requestId: 'request-1', status: 'QUOTED', offerId: 'offer-1' } });
});

test.each(['100001', 'abc'])('rejects an invalid price: %s', async (price) => {
  await mount();
  await enter('Price *', price);
  await press('Submit Offer');
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  expect(texts()).toContain(price === 'abc' ? 'Price must be numeric.' : 'Price must be between 1 and 100000.');
});

test.each([
  ['CH', 'CHF', '15.00'], ['LB', 'USD', '18.32'], ['DE', 'EUR', '18.32'],
  ['AE', 'AED', '67.29'], ['SA', 'SAR', '68.70'], ['QA', 'QAR', '66.69'],
])('raises a low %s offer to %s %s on blur and requires popup acknowledgement', async (country, currency, minimum) => {
  mockCountryCode = country;
  await mount();
  await enter('Price *', '10');
  expect(Alert.alert).not.toHaveBeenCalled();
  const priceField = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Price *');
  await act(async () => priceField().props.onBlur());
  expect(priceField().props.value).toBe(minimum);
  expect(Alert.alert).toHaveBeenCalledWith('Minimum offer amount', expect.stringContaining(minimum), expect.any(Array), { cancelable: false });
  await press('Submit Offer');
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  await act(async () => Alert.alert.mock.calls[0][2][0].onPress());
  await press('Submit Offer');
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request-1', expect.objectContaining({ currency, price: Number(minimum) }));
});

test.each(['0', '-5', '18.31'])('corrects a low USD offer %s on Submit without sending it', async (price) => {
  await mount();
  await enter('Price *', price);
  await press('Submit Offer');
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Price *').props.value).toBe('18.32');
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test.each(['18.32', '18.33', '100'])('accepts a valid USD offer of %s without a minimum popup', async (price) => {
  await mount();
  await enter('Price *', price);
  await press('Submit Offer');
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request-1', expect.objectContaining({ price: Number(price) }));
});

test('retains an empty price as a required field', async () => {
  await mount();
  await press('Submit Offer');
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(texts()).toContain('Price is required.');
});

test('native date and time controls preserve the selected day and submit ISO timestamps', async () => {
  await mount();
  await enter('Price *', '100');
  const pickup = new Date(); pickup.setDate(pickup.getDate() + 2); pickup.setHours(14, 30, 0, 0);
  const label = 'Estimated pickup date/time (optional)';
  await press(`${label} — Date`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, pickup));
  await press(`${label} — Time`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, pickup));
  await enter('Estimated duration (minutes)', '90');
  await press('Submit Offer');
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request-1', expect.objectContaining({ estimatedPickupAt: pickup.toISOString(), estimatedDurationMinutes: 90 }));
});

test('dismissed pickers and cleared dates remain optional', async () => {
  await mount();
  const label = 'Estimated pickup date/time (optional)';
  await press(`${label} — Date`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'dismissed' }));
  expect(tree.root.findAllByType('DateTimePicker')).toHaveLength(0);
  const future = new Date(Date.now() + 86400000);
  await press(`${label} — Date`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, future));
  await press(`Clear — ${label}`);
  expect(tree.root.findAllByType(OfferDateTimeField)[0].props.value).toBe('');
  await enter('Price *', '100');
  await press('Submit Offer');
  expect(sendDriverPriceOffer.mock.calls[0][1]).not.toHaveProperty('estimatedPickupAt');
});

test('iOS changes stay pending until Save', async () => {
  Platform.OS = 'ios';
  await mount();
  const future = new Date(Date.now() + 2 * 86400000);
  const label = 'Estimated pickup date/time (optional)';
  await press(`${label} — Date`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, future));
  expect(tree.root.findAllByType(OfferDateTimeField)[0].props.value).toBe('');
  await press('Cancel');
  expect(tree.root.findAllByType(OfferDateTimeField)[0].props.value).toBe('');
  await press(`${label} — Date`);
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, future));
  await press('Save');
  const saved = new Date(tree.root.findAllByType(OfferDateTimeField)[0].props.value);
  expect(saved.toDateString()).toBe(future.toDateString());
});

test('delivery estimates must follow pickup, and valid estimates are sent unchanged', async () => {
  await mount();
  await enter('Price *', '100');
  const pickup = new Date(Date.now() + 2 * 86400000).toISOString();
  const earlierDelivery = new Date(Date.parse(pickup) - 3600000).toISOString();
  await act(async () => {
    const fields = tree.root.findAllByType(OfferDateTimeField);
    fields[0].props.onChange(pickup);
    fields[1].props.onChange(earlierDelivery);
  });
  await press('Submit Offer');
  expect(sendDriverPriceOffer).not.toHaveBeenCalled();
  expect(texts()).toContain('Estimated delivery must be after estimated pickup.');
  const delivery = new Date(Date.parse(pickup) + 3600000).toISOString();
  await act(async () => tree.root.findAllByType(OfferDateTimeField)[1].props.onChange(delivery));
  await press('Submit Offer');
  expect(sendDriverPriceOffer).toHaveBeenCalledWith('request-1', expect.objectContaining({ estimatedPickupAt: pickup, estimatedDeliveryAt: delivery }));
});
