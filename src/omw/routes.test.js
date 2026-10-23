import { findOmwRoutes, mainRoutes } from './routes';
import { decodePolyline } from '@/lib/map-polyline';

jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/localization/i18n', () => ({ resolvedLanguage: 'fr' }));
const path = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const route = (summary, points = path) => ({
  summary, overview_polyline: { points },
  legs: [{ distance: { value: 2500 }, duration: { value: 300 } }],
});
const from = { address: 'From', latitude: 38.5, longitude: -120.2, placeId: 'origin-id' };
const to = { address: 'To', latitude: 43.252, longitude: -126.453, placeId: '' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test('keeps up to three distinct paths even with the same road summary, and ignores duplicate or invalid paths', () => {
  const routes = mainRoutes([
    route('A1', 'invalid'), route('A1'), route('A1', path + 'AA'),
    route('B2', path), route('B2', path + 'BB'), route('C3', path + 'CC'),
  ]);
  expect(routes.map(value => value.summary)).toEqual(['A1', 'A1', 'B2']);
  expect(routes[0]).toMatchObject({ distanceMeters: 2500, durationSeconds: 300 });
  expect(routes[0].coordinates[0]).toEqual({ latitude: 38.5, longitude: -120.2 });
  expect(decodePolyline('_')).toEqual([]);
});

test('requests driving alternatives using place IDs and the active language', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'OK', routes: [route('A1')] }) });
  const signal = new AbortController().signal;
  await expect(findOmwRoutes(from, to, signal)).resolves.toHaveLength(1);
  const [url, options] = global.fetch.mock.calls[0];
  const params = new URL(url).searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ origin: 'place_id:origin-id', destination: '43.252,-126.453', alternatives: 'true', mode: 'driving', language: 'fr' });
  expect(options.signal).toBe(signal);
});

test('distinguishes no route from a provider failure and rejects HTTP errors', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) });
  await expect(findOmwRoutes(from, to, new AbortController().signal)).resolves.toEqual([]);
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'REQUEST_DENIED' }) });
  await expect(findOmwRoutes(from, to, new AbortController().signal)).rejects.toThrow();
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ status: 'OK', routes: [route('A1')] }) });
  await expect(findOmwRoutes(from, to, new AbortController().signal)).rejects.toThrow();
});

test('builds up to three complete alternatives through the optional via place', async () => {
  const via = { address: 'Midtown', latitude: 40, longitude: -121, placeId: 'midtown' };
  const before = [route('A1'), route('A2', path + 'AA')];
  const after = [route('B1', path + 'BB'), route('B2', path + 'CC')];
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => ({ status: 'OK',
    routes: new URL(url).searchParams.get('origin') === 'place_id:origin-id' ? before : after,
  }) }));
  const signal = new AbortController().signal;
  const result = await findOmwRoutes(from, to, signal, via);
  expect(result).toHaveLength(3);
  expect(new Set(result.map(value => value.id)).size).toBe(3);
  expect(result[0]).toMatchObject({ summary: 'A1 / B1', distanceMeters: 5000, durationSeconds: 600,
    coordinates: [...decodePolyline(path), ...decodePolyline(path + 'BB')] });
  const requests = global.fetch.mock.calls.map(([url]) => Object.fromEntries(new URL(url).searchParams));
  expect(requests).toEqual([
    expect.objectContaining({ origin: 'place_id:origin-id', destination: 'place_id:midtown', alternatives: 'true' }),
    expect.objectContaining({ origin: 'place_id:midtown', destination: '43.252,-126.453', alternatives: 'true' }),
  ]);
  expect(global.fetch.mock.calls.every(([, options]) => options.signal === signal)).toBe(true);
});

test('returns no via routes if either side is unreachable', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) });
  await expect(findOmwRoutes(from, to, new AbortController().signal, { ...from, placeId: 'midtown' })).resolves.toEqual([]);
});
