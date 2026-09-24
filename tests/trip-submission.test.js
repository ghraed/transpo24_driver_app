import { pickupItem, startDelivery, deliverItem } from '../src/services/tripService';
import { readAccessToken } from '@/lib/auth-storage';

jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn() }));
jest.mock('@/config/backend', () => ({
  getBackendApiBaseUrl: () => 'https://api.example.test',
  createBackendReachabilityError: () => new Error('Backend unavailable'),
}));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: async value => value }));
jest.mock('@/localization/i18n', () => ({ language: 'en' }));

const tripId = 'swiss-job';
const identity = { tripId, driverId: 'french-driver', customerId: 'swiss-customer' };
const pickupResponse = {
  ...identity, status: 'ITEM_PICKED_UP', pickedUpAt: '2026-09-24T10:00:00Z',
  pickupNotes: null, pickupProofImageUrl: 'https://example.test/pickup.jpg', nextStep: 'DELIVER_ITEM',
};
const deliveryResponse = {
  ...identity, status: 'DELIVERED', deliveredAt: '2026-09-24T11:00:00Z',
  deliveryNotes: null, deliveryProofImageUrl: 'https://example.test/delivery.jpg', nextStep: 'VIEW_EARNINGS_AND_RATINGS',
};
const startResponse = {
  ...identity, status: 'DRIVER_GOING_TO_DROPOFF', startedAt: '2026-09-24T10:01:00Z',
  dropoffLocation: { latitude: 46.5, longitude: 6.6, address: 'Lausanne' }, nextStep: 'GO_TO_DROPOFF',
};
const originalFetch = global.fetch;
const originalXhr = global.XMLHttpRequest;
let xhr;
let appendSpy;
beforeEach(() => {
  jest.clearAllMocks();
  appendSpy = jest.spyOn(global.FormData.prototype, 'append');
  readAccessToken.mockResolvedValue('driver-token');
  global.fetch = jest.fn();
  xhr = { open: jest.fn(), setRequestHeader: jest.fn(), send: jest.fn(), status: 200 };
  global.XMLHttpRequest = jest.fn(() => xhr);
});
afterEach(() => { appendSpy.mockRestore(); global.fetch = originalFetch; global.XMLHttpRequest = originalXhr; });

it.each([
  ['pickup-item', pickupItem, pickupResponse],
  ['deliver-item', deliverItem, deliveryResponse],
])('%s submits proof photos for the selected foreign job using the driver token', async (endpoint, submit, response) => {
  xhr.send.mockImplementation(() => { xhr.responseText = JSON.stringify(response); xhr.onload(); });
  await expect(submit(tripId, {
    notes: ' Received safely ',
    proofPhotos: [{ uri: 'content://proof/1', fileName: 'proof.jpg', mimeType: 'image/jpeg' }],
  })).resolves.toEqual(response);
  expect(xhr.open).toHaveBeenCalledWith('PATCH', `https://api.example.test/driver/trips/${tripId}/${endpoint}`);
  expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer driver-token');
  expect(appendSpy).toHaveBeenCalledWith('notes', 'Received safely');
  expect(appendSpy).toHaveBeenCalledWith('photos', {
    uri: 'content://proof/1', name: 'proof.jpg', type: 'image/jpeg',
  });
  expect(appendSpy.mock.calls.some(([field]) => /tenant/i.test(field))).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('starts delivery of the selected foreign job with no client tenant override', async () => {
  global.fetch.mockResolvedValue(new Response(JSON.stringify(startResponse), { status: 200 }));
  await expect(startDelivery(tripId)).resolves.toEqual(startResponse);
  expect(global.fetch).toHaveBeenCalledWith(`https://api.example.test/driver/trips/${tripId}/start-delivery`, expect.objectContaining({
    method: 'PATCH', body: '{}', headers: expect.objectContaining({ Authorization: 'Bearer driver-token' }),
  }));
});

it.each([pickupItem, deliverItem])('propagates denied proof upload without reporting a successful transition', async submit => {
  xhr.status = 403;
  xhr.send.mockImplementation(() => { xhr.responseText = JSON.stringify({ message: 'Request access denied' }); xhr.onload(); });
  await expect(submit(tripId, { proofPhotos: [{ uri: 'file:///proof.jpg' }] })).rejects.toThrow('Request access denied');
});

it.each([pickupItem, startDelivery, deliverItem])('rejects malformed success responses', async submit => {
  global.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  await expect(submit(tripId, {})).rejects.toThrow(/Invalid .* response/);
});

it.each([pickupItem, deliverItem])('rejects invalid coordinates before submitting a trip action', async submit => {
  await expect(submit(tripId, { latitude: 91, longitude: 6.1 })).rejects.toThrow('Latitude must be between -90 and 90.');
  expect(global.fetch).not.toHaveBeenCalled();
  expect(xhr.send).not.toHaveBeenCalled();
});

it('permits an explicit retry after a failed upload', async () => {
  xhr.send.mockImplementationOnce(() => xhr.onerror());
  await expect(pickupItem(tripId, { proofPhotos: [{ uri: 'file:///proof.jpg' }] })).rejects.toThrow('Backend unavailable');
  xhr.send.mockImplementationOnce(() => { xhr.responseText = JSON.stringify(pickupResponse); xhr.onload(); });
  await expect(pickupItem(tripId, { proofPhotos: [{ uri: 'file:///proof.jpg' }] })).resolves.toEqual(pickupResponse);
});
