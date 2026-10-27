import { searchPlacesAutocomplete, fetchPlaceDetails, resolvePlaceSuggestion, resolvePlaceFromQuery, reverseGeocodeCoordinates } from './places';
import { requestDriverPlaces } from '@/lib/api';
import { Platform } from 'react-native';
jest.mock('@/lib/api', () => ({ requestDriverPlaces: jest.fn() }));
jest.mock('expo-application', () => ({ applicationId: 'com.transpo24.driver' }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { language: 'de' } }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: jest.fn(async message => message) }));
const fetchMock = requestDriverPlaces;
const ok = value => value;
beforeEach(() => { jest.clearAllMocks(); fetchMock.mockReset(); });
const originalOS = Platform.OS;
const originalFetch = global.fetch;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  global.fetch = originalFetch;
});

test('empty autocomplete input skips network', async () => {
  await expect(searchPlacesAutocomplete('   ')).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('autocomplete maps predictions and accepts zero results', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'OK', predictions: [{ description: 'Beirut, Lebanon', place_id: 'place-1' }] }));
  await expect(searchPlacesAutocomplete(' Beirut ')).resolves.toEqual([{ description: 'Beirut, Lebanon', placeId: 'place-1' }]);
  expect(fetchMock).toHaveBeenCalledWith('autocomplete', { input: 'Beirut' });
  fetchMock.mockResolvedValueOnce(ok({ status: 'ZERO_RESULTS' }));
  await expect(searchPlacesAutocomplete('unknown')).resolves.toEqual([]);
});

test('places errors expose original API message and reject missing coordinates', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Place service unavailable.'));
  await expect(searchPlacesAutocomplete('Beirut')).rejects.toThrow('Place service unavailable.');
  fetchMock.mockResolvedValueOnce(ok({ status: 'OK', result: { formatted_address: 'Beirut' } }));
  await expect(fetchPlaceDetails('place-1')).rejects.toThrow('Place details did not return coordinates');
});

test('resolved suggestion falls back to its description when detail has no address', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'OK', result: { geometry: { location: { lat: 33.9, lng: 35.5 } } } }));
  await expect(resolvePlaceSuggestion({ description: 'Beirut', placeId: 'place-1' })).resolves.toEqual({
    latitude: 33.9, longitude: 35.5, address: 'Beirut', placeId: 'place-1',
  });
});

test('query resolution rejects no matches', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'ZERO_RESULTS' }));
  await expect(resolvePlaceFromQuery('missing')).rejects.toThrow('No matching places found');
});

test('reverse geocode uses plus code when address is absent and returns null without any address', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'ZERO_RESULTS', plus_code: { compound_code: 'ABCD Beirut' } }));
  await expect(reverseGeocodeCoordinates(33.9, 35.5)).resolves.toEqual({ latitude: 33.9, longitude: 35.5, address: 'ABCD Beirut', placeId: '' });
  fetchMock.mockResolvedValueOnce(ok({ status: 'ZERO_RESULTS', results: [] }));
  await expect(reverseGeocodeCoordinates(33.9, 35.5)).resolves.toBeNull();
});

test.each([404, 502, 503])('Android retains working search when the backend returns %s', async status => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  fetchMock.mockRejectedValue(Object.assign(new Error('Backend unavailable'), { status }));
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'OK', predictions: [{ place_id: 'id', description: 'Steinweg' }] }) }));
  await expect(searchPlacesAutocomplete('Steinweg')).resolves.toEqual([{ placeId: 'id', description: 'Steinweg' }]);
  expect(global.fetch.mock.calls[0][0]).toContain('language=de');
  expect(global.fetch.mock.calls[0][1].headers).toEqual({ 'X-Android-Package': 'com.transpo24.driver', 'X-Android-Cert': '359C7B65774F00084F35199870BBE8A38656ADF4' });
});

test('Android fallback resolves details and reverse geocoding', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  fetchMock.mockRejectedValue(Object.assign(new Error('Not configured'), { status: 503 }));
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'OK', result: { formatted_address: 'Steinweg', geometry: { location: { lat: 47, lng: 7 } } } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'OK', results: [{ formatted_address: 'Steinweg', place_id: 'id' }] }) });
  await expect(fetchPlaceDetails('id')).resolves.toMatchObject({ latitude: 47, longitude: 7 });
  await expect(reverseGeocodeCoordinates(47, 7)).resolves.toMatchObject({ address: 'Steinweg' });
  expect(global.fetch.mock.calls[0][0]).toContain('place_id=id');
  expect(global.fetch.mock.calls[1][0]).toContain('latlng=47%2C7');
});

test.each([['ios', 503], ['android', 401], ['android', 403], ['android', 400], ['android', 429]])(
  '%s does not bypass backend status %s', async (os, status) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    fetchMock.mockRejectedValue(Object.assign(new Error('Backend error'), { status }));
    global.fetch = jest.fn();
    await expect(searchPlacesAutocomplete('Steinweg')).rejects.toMatchObject({ status });
    expect(global.fetch).not.toHaveBeenCalled();
  },
);
