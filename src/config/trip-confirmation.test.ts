import { expect, it, jest } from '@jest/globals';
import { getTripConfirmationRadiusMeters } from './trip-confirmation';
import { isLocalBackendUrl } from './environment';

let mockApiUrl = 'https://api.transpo24.com';
jest.mock('./backend', () => ({
  getBackendApiBaseUrl: () => {
    if (!mockApiUrl) throw new Error('Missing backend configuration');
    return mockApiUrl;
  },
}));

it.each<[string, number, boolean]>([
  ['https://api.transpo24.com', 100, false],
  ['http://127.0.0.1:3001', 2000, true],
  ['http://localhost:3001', 2000, true],
  ['http://10.0.2.2:3001', 2000, true],
  ['http://192.168.1.50:3001', 2000, true],
])('uses the same environment as the header for %s', (url, expected, local) => {
  mockApiUrl = url;
  expect(isLocalBackendUrl(url)).toBe(local);
  expect(getTripConfirmationRadiusMeters()).toBe(expected);
});

it('defaults to the strict radius when backend configuration is unavailable', () => {
  mockApiUrl = '';
  expect(getTripConfirmationRadiusMeters()).toBe(100);
});

it.each<[string, number]>([
  ['https://api.transpo24.com', 100],
  ['http://127.0.0.1:3001', 2000],
])('applies the selected radius to arrival, pickup and dropoff at %s', (url, radius) => {
  mockApiUrl = url;
  jest.isolateModules(() => {
    const { canMarkArrived } = jest.requireActual<typeof import('../utils/locationValidation')>('../utils/locationValidation');
    const { canConfirmPickup, PICKUP_CONFIRM_RADIUS_METERS } = jest.requireActual<typeof import('../utils/pickupValidation')>('../utils/pickupValidation');
    const { canConfirmDelivery, DELIVER_CONFIRM_RADIUS_METERS } = jest.requireActual<typeof import('../utils/deliveryValidation')>('../utils/deliveryValidation');
    expect(PICKUP_CONFIRM_RADIUS_METERS).toBe(radius);
    expect(DELIVER_CONFIRM_RADIUS_METERS).toBe(radius);
    const origin = { latitude: 0, longitude: 0 };
    const point = (metres: number) => ({ latitude: 0, longitude: metres / 6371000 * 180 / Math.PI });
    for (const check of [canMarkArrived, canConfirmPickup, canConfirmDelivery]) {
      expect(check(origin, origin)).toBe(true);
      expect(check(origin, point(radius - 0.01))).toBe(true);
      expect(check(origin, point(radius + 0.01))).toBe(false);
      expect(check({ latitude: NaN, longitude: 0 }, origin)).toBe(false);
    }
  });
});
