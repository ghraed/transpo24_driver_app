import { findOmwRoutes, mainRoutes } from './routes';
import { computeDriverRoutes } from '@/lib/api';
import { decodePolyline } from '@/lib/map-polyline';
jest.mock('@/lib/api', () => ({ computeDriverRoutes: jest.fn() }));
const path = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const route = (summary, points = path) => ({ summary, overview_polyline: { points },
  legs: [{ distance: { value: 2500 }, duration: { value: 300 } }] });
const from = { address: 'From', latitude: 38.5, longitude: -120.2, placeId: 'origin-id' };
const to = { address: 'To', latitude: 43.252, longitude: -126.453, placeId: '' };
beforeEach(() => jest.resetAllMocks());
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


test('requests alternatives through the authenticated backend with place IDs and cancellation', async () => {
  computeDriverRoutes.mockResolvedValue({ status: 'OK', routes: [route('A1')] });
  const signal = new AbortController().signal;
  await expect(findOmwRoutes(from, to, signal)).resolves.toHaveLength(1);
  expect(computeDriverRoutes).toHaveBeenCalledWith(from, to, signal, true);
});
test('distinguishes no route from a provider or backend failure', async () => {
  computeDriverRoutes.mockResolvedValue({ status: 'ZERO_RESULTS' });
  await expect(findOmwRoutes(from, to, new AbortController().signal)).resolves.toEqual([]);
  computeDriverRoutes.mockRejectedValue(new Error('Routes unavailable'));
  await expect(findOmwRoutes(from, to, new AbortController().signal)).rejects.toThrow();
});
test('combines complete alternatives through the optional via place', async () => {
  const via = { ...from, placeId: 'midtown' };
  computeDriverRoutes.mockResolvedValueOnce({ status: 'OK', routes: [route('A1'), route('A2', path+'AA')] })
    .mockResolvedValueOnce({ status: 'OK', routes: [route('B1', path+'BB'), route('B2', path+'CC')] });
  const signal = new AbortController().signal;
  const result = await findOmwRoutes(from, to, signal, via);
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ summary: 'A1 / B1', distanceMeters: 5000, durationSeconds: 600,
    coordinates: [...decodePolyline(path), ...decodePolyline(path+'BB')] });
  expect(computeDriverRoutes.mock.calls).toEqual([[from, via, signal, true], [via, to, signal, true]]);
});
test('returns no via routes when a leg is unreachable', async () => {
  computeDriverRoutes.mockResolvedValue({ status: 'ZERO_RESULTS' });
  await expect(findOmwRoutes(from, to, new AbortController().signal, { ...from, placeId: 'via' })).resolves.toEqual([]);
});
