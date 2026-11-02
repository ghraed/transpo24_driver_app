import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DriverRoutePolyline } from './driver-route-polyline';
import { computeDriverRoutes } from '@/lib/api';

jest.mock('@/components/native-maps', () => ({ NativePolyline: 'Polyline' }));
jest.mock('@/lib/api', () => ({ computeDriverRoutes: jest.fn() }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: async message => message }));

const origin = { latitude: 38.5, longitude: -120.2 };
const destination = { latitude: 43.252, longitude: -126.453 };
const response = { status: 'OK', routes: [{ overview_polyline: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }] };
let tree;
const props = { origin, destination, apikey: '', strokeColor: 'green' };
async function mount(overrides = {}) {
  await act(async () => { tree = create(<DriverRoutePolyline {...props} {...overrides} />); });
}
let testTime = Date.now();
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(testTime += 10 * 60 * 1000);
  jest.clearAllMocks();
  computeDriverRoutes.mockResolvedValue(response);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('does not cancel an in-flight route on parent renders or frequent GPS updates', async () => {
  let resolve;
  computeDriverRoutes.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const onReady = jest.fn();
  await mount({ onReady });
  const signal = computeDriverRoutes.mock.calls[0][2];
  for (let step = 1; step <= 6; step++) {
    await act(async () => {
      tree.update(<DriverRoutePolyline {...props} origin={{ ...origin, latitude: origin.latitude + step * 0.001 }}
        destination={{ ...destination }} onError={() => {}} onReady={onReady} />);
      jest.advanceTimersByTime(3000);
    });
  }
  expect(signal.aborted).toBe(false);
  expect(computeDriverRoutes).toHaveBeenCalledTimes(1);
  await act(async () => resolve(response));
  expect(onReady).toHaveBeenCalledWith(expect.arrayContaining([origin, destination]));
  expect(tree.root.findByType('Polyline').props.coordinates).toHaveLength(3);
  await act(async () => jest.advanceTimersByTime(15000));
  expect(computeDriverRoutes).toHaveBeenLastCalledWith(
    expect.objectContaining({ latitude: origin.latitude + 0.006 }), destination, expect.anything(),
  );
});

test('does not refetch for callback changes, equivalent coordinates or a stationary driver', async () => {
  await mount();
  await act(async () => {
    tree.update(<DriverRoutePolyline {...props} origin={{ ...origin, heading: 90 }} destination={{ ...destination }}
      onError={() => {}} onReady={() => {}} />);
    jest.advanceTimersByTime(60000);
  });
  expect(computeDriverRoutes).toHaveBeenCalledTimes(1);
});

test('retries transient failures and keeps the last route visible during recovery', async () => {
  const onError = jest.fn();
  const onReady = jest.fn();
  await mount({ onError, onReady });
  computeDriverRoutes.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    tree.update(<DriverRoutePolyline {...props} origin={{ ...origin, latitude: 38.6 }} onError={onError} onReady={onReady} />);
  });
  await act(async () => jest.advanceTimersByTime(15000));
  expect(onError).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType('Polyline')).toBeDefined();
  await act(async () => jest.advanceTimersByTime(15000));
  expect(onReady).toHaveBeenCalledTimes(2);
});

test.each([
  { status: 'ZERO_RESULTS', routes: [] },
  { status: 'OK', routes: [] },
  { status: 'OK', routes: [{ overview_polyline: { points: 'invalid' } }] },
])('reports an unusable route without rendering a misleading line: %j', async data => {
  computeDriverRoutes.mockResolvedValue(data);
  const onError = jest.fn();
  await mount({ onError });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('Polyline')).toHaveLength(0);
});

test('aborts stale destinations and ignores late responses after unmount', async () => {
  let resolve;
  computeDriverRoutes.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const onReady = jest.fn();
  await mount({ onReady });
  const firstSignal = computeDriverRoutes.mock.calls[0][2];
  const nextDestination = { latitude: 40.7, longitude: -120.95 };
  await act(async () => {
    tree.update(<DriverRoutePolyline {...props} destination={nextDestination} onReady={onReady} />);
  });
  expect(firstSignal.aborted).toBe(true);
  expect(computeDriverRoutes).toHaveBeenLastCalledWith(origin, nextDestination, expect.anything());
  const secondSignal = computeDriverRoutes.mock.calls[1][2];
  await act(async () => tree.unmount());
  tree = null;
  expect(secondSignal.aborted).toBe(true);
  await act(async () => resolve(response));
  expect(onReady).toHaveBeenCalledTimes(1);
});


test('retains a recent road route when reopening the map while offline', async () => {
  await mount();
  const coordinates = tree.root.findByType('Polyline').props.coordinates;
  await act(async () => tree.unmount());
  tree = null;
  computeDriverRoutes.mockRejectedValueOnce(new Error('Offline'));
  await mount();
  expect(tree.root.findByType('Polyline').props.coordinates).toEqual(coordinates);
});


test('retries a failed route immediately when returning to the app', async () => {
  let foreground;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    foreground = callback;
    return { remove: jest.fn() };
  });
  computeDriverRoutes.mockRejectedValueOnce(new Error('Offline'));
  await mount();
  await act(async () => foreground('active'));
  expect(computeDriverRoutes).toHaveBeenCalledTimes(2);
  expect(tree.root.findByType('Polyline')).toBeDefined();
});
