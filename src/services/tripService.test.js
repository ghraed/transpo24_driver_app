import { pickupItem, startDelivery, deliverItem, createAdditionalExpense } from './tripService';

jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.example.test', createBackendReachabilityError: endpoint => new Error(`Backend unavailable: ${endpoint}`) }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn().mockResolvedValue('driver-token') }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: jest.fn(async message => message) }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { language: 'en' } }));

const fetchMock = jest.fn();
const pickupResponse = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'ITEM_PICKED_UP', pickedUpAt: '2026-01-01', pickupNotes: null, pickupProofImageUrl: null, nextStep: 'DELIVER_ITEM' };
const startResponse = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'DRIVER_GOING_TO_DROPOFF', startedAt: '2026-01-01', nextStep: 'GO_TO_DROPOFF', dropoffLocation: { latitude: 33.9, longitude: 35.5 } };
const deliveryResponse = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'DELIVERED', deliveredAt: '2026-01-01', deliveryNotes: null, deliveryProofImageUrl: null, nextStep: 'VIEW_EARNINGS_AND_RATINGS' };
const ok = value => ({ ok: true, json: async () => value });
beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock; });

test('pickup validates input before network and sends authenticated request', async () => {
  await expect(pickupItem('short', {})).rejects.toThrow('Invalid trip id');
  await expect(pickupItem('trip-123', { latitude: 1 })).rejects.toThrow(/together/);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(ok(pickupResponse));
  await expect(pickupItem(' trip-123 ', { notes: 'Ready' })).resolves.toEqual(pickupResponse);
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/driver/trips/trip-123/pickup-item', expect.objectContaining({
    method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer driver-token' }), body: JSON.stringify({ notes: 'Ready' }),
  }));
});

test('pickup surfaces server errors and rejects malformed success payloads', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, text: async () => JSON.stringify({ details: { message: 'Pickup already confirmed' } }) });
  await expect(pickupItem('trip-123', {})).rejects.toMatchObject({ message: 'Pickup already confirmed', sourceMessage: 'Pickup already confirmed' });
  fetchMock.mockResolvedValueOnce(ok({ status: 'ITEM_PICKED_UP' }));
  await expect(pickupItem('trip-123', {})).rejects.toThrow('Invalid pickup item response');
});

test('start and delivery validate transitions and network failures', async () => {
  fetchMock.mockResolvedValueOnce(ok(startResponse)).mockResolvedValueOnce(ok(deliveryResponse));
  await expect(startDelivery('trip-123')).resolves.toMatchObject({ status: 'DRIVER_GOING_TO_DROPOFF' });
  await expect(deliverItem('trip-123', { latitude: 33.9, longitude: 35.5 })).resolves.toEqual(deliveryResponse);
  await expect(deliverItem('trip-123', { proofImageUrl: 'javascript:bad' })).rejects.toThrow(/valid URL/);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
  await expect(startDelivery('trip-123')).rejects.toThrow(/Backend unavailable/);
});

test('additional expenses reject invalid amount, reason and invoice before upload', async () => {
  const expense = { amount: 0, currency: 'USD', reason: 'Toll', invoicePhoto: { uri: 'file:///invoice.jpg' } };
  await expect(createAdditionalExpense('trip-123', expense)).rejects.toThrow(/greater than 0/);
  await expect(createAdditionalExpense('trip-123', { ...expense, amount: 10, reason: ' ' })).rejects.toThrow(/reason is required/);
  await expect(createAdditionalExpense('trip-123', { ...expense, amount: 10, invoicePhoto: { uri: ' ' } })).rejects.toThrow(/photo is required/);
  expect(fetchMock).not.toHaveBeenCalled();
});
