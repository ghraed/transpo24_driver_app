import { searchPlacesAutocomplete, fetchPlaceDetails, resolvePlaceSuggestion, resolvePlaceFromQuery, reverseGeocodeCoordinates } from './places';

jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { language: 'en' } }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: jest.fn(async message => message) }));
const fetchMock = jest.fn();
const ok = value => ({ ok: true, json: async () => value });
beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock; });

test('empty autocomplete input skips network', async () => {
  await expect(searchPlacesAutocomplete('   ')).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('autocomplete maps predictions and accepts zero results', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'OK', predictions: [{ description: 'Beirut, Lebanon', place_id: 'place-1' }] }));
  await expect(searchPlacesAutocomplete(' Beirut ')).resolves.toEqual([{ description: 'Beirut, Lebanon', placeId: 'place-1' }]);
  expect(fetchMock.mock.calls[0][0]).toContain('input=Beirut');
  fetchMock.mockResolvedValueOnce(ok({ status: 'ZERO_RESULTS' }));
  await expect(searchPlacesAutocomplete('unknown')).resolves.toEqual([]);
});

test('places errors expose original API message and reject missing coordinates', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error_message: 'Quota exceeded' }) });
  await expect(searchPlacesAutocomplete('Beirut')).rejects.toMatchObject({ sourceMessage: 'Quota exceeded' });
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
