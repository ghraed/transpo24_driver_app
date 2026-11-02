import { afterEach, expect, it, jest } from '@jest/globals';
import { getRecentTripLocation, rememberTripLocation } from './trip-location-cache';

afterEach(() => { jest.restoreAllMocks(); });

it('preserves a recent real GPS fix for the same trip only and copies its value', () => {
  const location = { latitude: 33.89, longitude: 35.5, heading: 90 };
  rememberTripLocation('handoff', location);
  location.latitude = 0;
  expect(getRecentTripLocation('handoff')).toEqual({ latitude: 33.89, longitude: 35.5, heading: 90 });
  expect(getRecentTripLocation('another-trip')).toBeNull();
});

it('does not display a stale driver position or store invalid GPS', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(100000);
  rememberTripLocation('expiry', { latitude: 33.89, longitude: 35.5 });
  now.mockReturnValue(160001);
  expect(getRecentTripLocation('expiry')).toBeNull();
  rememberTripLocation('invalid', { latitude: NaN, longitude: 35.5 });
  expect(getRecentTripLocation('invalid')).toBeNull();
});
