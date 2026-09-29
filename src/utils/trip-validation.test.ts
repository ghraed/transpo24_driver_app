import { describe, expect, it, test } from '@jest/globals';
import * as pickup from './pickupValidation';
import * as delivery from './deliveryValidation';
import * as location from './locationValidation';

const origin = { latitude: 0, longitude: 0 };
const near = { latitude: 0, longitude: 0.0134 }; // roughly 1.49 km at equator
const far = { latitude: 0, longitude: 0.0136 }; // roughly 1.51 km at equator
const invalid = { latitude: 91, longitude: 0 };

describe.each([
  ['pickup', pickup.canConfirmPickup, pickup.calculateDistanceMeters],
  ['delivery', delivery.canConfirmDelivery, delivery.calculateDistanceMeters],
])('%s location confirmation', (_, canConfirm, distance) => {
  it('accepts a nearby position including exactly the destination', () => {
    expect(canConfirm(origin, origin)).toBe(true);
    expect(canConfirm(origin, near)).toBe(true);
    expect(distance(origin, origin)).toBe(0);
  });
  it('rejects a position outside the 1.5 km radius and invalid coordinates', () => {
    expect(canConfirm(origin, far)).toBe(false);
    expect(canConfirm(invalid, invalid)).toBe(false);
  });
});

test('arrival confirmation rejects invalid coordinates as well as distant positions', () => {
  expect(location.canMarkArrived(origin, near)).toBe(true);
  expect(location.canMarkArrived(origin, far)).toBe(false);
  expect(location.canMarkArrived(invalid, invalid)).toBe(false);
});

describe.each([
  ['pickup', pickup.validatePickupItemRequest],
  ['delivery', delivery.validateDeliverItemRequest],
])('%s request', (_, validate) => {
  it('allows an empty request and valid boundary coordinates and notes', () => {
    expect(validate({})).toBeNull();
    expect(validate({ latitude: -90, longitude: 180, notes: 'x'.repeat(500), proofImageUrl: 'https://example.com/proof' })).toBeNull();
  });
  it('requires both coordinates and rejects out of range or non-finite values', () => {
    expect(validate({ latitude: 0 })).toMatch(/together/);
    expect(validate({ longitude: 0 })).toMatch(/together/);
    expect(validate({ latitude: Infinity, longitude: 0 })).toMatch(/Latitude/);
    expect(validate({ latitude: 0, longitude: 181 })).toMatch(/Longitude/);
  });
  it('rejects oversized notes and unsafe proof URLs', () => {
    expect(validate({ notes: 'x'.repeat(501) })).toMatch(/500/);
    expect(validate({ proofImageUrl: 'javascript:alert(1)' })).toMatch(/URL/);
  });
});

test.each([pickup.isValidTripId, delivery.isValidTripId])('trip IDs use trimmed length bounds', validate => {
  expect(validate(' 12345678 ')).toBe(true);
  expect(validate('1234567')).toBe(false);
  expect(validate('x'.repeat(64))).toBe(true);
  expect(validate('x'.repeat(65))).toBe(false);
});

const pickupResponse = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'ITEM_PICKED_UP', pickedUpAt: '2026-01-01', pickupNotes: null, pickupProofImageUrl: null, nextStep: 'DELIVER_ITEM' };
const deliveryResponse = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'DELIVERED', deliveredAt: '2026-01-01', deliveryNotes: null, deliveryProofImageUrl: null, nextStep: 'VIEW_EARNINGS_AND_RATINGS' };

test('pickup and delivery responses accept valid payloads and reject invalid status and optional fields', () => {
  expect(pickup.validatePickupItemResponse(pickupResponse)).toMatchObject(pickupResponse);
  expect(pickup.validatePickupItemResponse({ ...pickupResponse, status: 'UNKNOWN' })).toBeNull();
  expect(pickup.validatePickupItemResponse({ ...pickupResponse, pickupNotes: 42 })).toBeNull();
  expect(delivery.validateDeliverItemResponse(deliveryResponse)).toMatchObject(deliveryResponse);
  expect(delivery.validateDeliverItemResponse({ ...deliveryResponse, status: 'COMPLETED' })).toBeNull();
  expect(delivery.validateDeliverItemResponse({ ...deliveryResponse, deliveryProofImageUrl: 42 })).toBeNull();
  expect(delivery.validateDeliverItemResponse(null)).toBeNull();
});

test('start delivery response requires a valid destination and transition', () => {
  const response = { tripId: 'trip-123', driverId: 'driver', customerId: 'customer', status: 'DRIVER_GOING_TO_DROPOFF', startedAt: '2026-01-01', nextStep: 'GO_TO_DROPOFF', dropoffLocation: { latitude: 90, longitude: -180 } };
  expect(delivery.validateStartDeliveryResponse(response)?.dropoffLocation.address).toBeNull();
  expect(delivery.validateStartDeliveryResponse({ ...response, dropoffLocation: invalid })).toBeNull();
  expect(delivery.validateStartDeliveryResponse({ ...response, nextStep: 'DONE' })).toBeNull();
});

test('socket location payload validates coordinates and normalizes optional telemetry', () => {
  const payload = { tripId: 'trip-123', driverId: 'driver', latitude: 0, longitude: 0, recordedAt: '2026-01-01' };
  expect(location.validateDriverLocationUpdatedPayload(payload)).toEqual({ ...payload, heading: null, speed: null, accuracy: null });
  expect(location.validateDriverLocationUpdatedPayload({ ...payload, latitude: NaN })).toBeNull();
  expect(location.validateDriverLocationUpdatedPayload({ ...payload, recordedAt: null })).toBeNull();
});

test('trip status updates reject unknown statuses', () => {
  const payload = { tripId: 'trip-123', status: 'DELIVERED', updatedAt: '2026-01-01' };
  expect(delivery.validateTripStatusUpdatedPayload(payload)).toEqual(payload);
  expect(delivery.validateTripStatusUpdatedPayload({ ...payload, status: 'UNKNOWN' })).toBeNull();
});
