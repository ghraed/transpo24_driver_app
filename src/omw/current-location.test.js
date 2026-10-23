import * as Location from 'expo-location';
import { reverseGeocodeCoordinates } from '@/lib/places';
import { resolveOmwCurrentAddress } from './current-location';

jest.mock('expo-location', () => ({ reverseGeocodeAsync: jest.fn() }));
jest.mock('@/lib/places', () => ({ reverseGeocodeCoordinates: jest.fn() }));
beforeEach(() => { jest.resetAllMocks(); });

test('uses the current coordinates with the resolved Google address', async () => {
  reverseGeocodeCoordinates.mockResolvedValue({ latitude: 33.9, longitude: 35.6, address: 'Beirut', placeId: 'nearby-building' });
  await expect(resolveOmwCurrentAddress(33.89, 35.5)).resolves.toEqual({ latitude: 33.89, longitude: 35.5, address: 'Beirut', placeId: '' });
  expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
});

test('falls back to native address lookup when Google is unavailable', async () => {
  reverseGeocodeCoordinates.mockRejectedValue(new Error('unavailable'));
  Location.reverseGeocodeAsync.mockResolvedValue([{ streetNumber: '10', street: 'Main Street', city: 'Beirut', country: 'Lebanon' }]);
  await expect(resolveOmwCurrentAddress(33.89, 35.5)).resolves.toEqual({ latitude: 33.89, longitude: 35.5, address: '10 Main Street, Beirut, Lebanon', placeId: '' });
});

test('returns no address when neither provider resolves the position', async () => {
  reverseGeocodeCoordinates.mockResolvedValue(null);
  Location.reverseGeocodeAsync.mockResolvedValue([]);
  await expect(resolveOmwCurrentAddress(33.89, 35.5)).resolves.toBeNull();
});
