import { getDriverVehicle } from './api';

jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.example.test' }));
jest.mock('./auth-storage', () => ({ readAccessToken: jest.fn().mockResolvedValue('token') }));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue(JSON.stringify({
      vehicle: {
        id: 'vehicle-1', vehicleType: 'VAN', make: 'Ford', model: 'Transit',
        plateNumber: 'ABC123', status: 'PENDING_REVIEW',
      },
      documents: [{
        id: 'document-1', type: 'VEHICLE_FRONT_PHOTO', status: 'UPLOADED',
        url: '/uploads/front.jpg', createdAt: '2026-09-29',
      }],
    })),
  });
});

it('keeps documents returned beside the selected vehicle', async () => {
  const vehicle = await getDriverVehicle('vehicle-1');
  expect(vehicle.licensePlateNumber).toBe('ABC123');
  expect(vehicle.documents).toEqual([expect.objectContaining({
    type: 'VEHICLE_FRONT_PHOTO', url: 'https://api.example.test/uploads/front.jpg',
  })]);
});
