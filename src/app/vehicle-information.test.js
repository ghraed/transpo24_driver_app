import React from 'react';
import { act, create } from 'react-test-renderer';

import VehicleInformationScreen from './vehicle-information';
import { createDriverVehicle, getDriverVehicle, getDriverVehicles } from '@/lib/api';

const mockRouter = { replace: jest.fn() };
const mockT = (key, values) => values?.label ? key.replace('{{label}}', values.label) : key;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ flow: 'onboarding' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/auth-storage', () => ({
  readVehicleInformationDraft: jest.fn().mockResolvedValue(null),
  persistVehicleInformationDraft: jest.fn().mockResolvedValue(undefined),
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearVehicleInformationDraft: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/api', () => ({
  getDriverVehicles: jest.fn(),
  getDriverVehicle: jest.fn(),
  createDriverVehicle: jest.fn(),
  updateDriverVehicle: jest.fn(),
  uploadDriverVehicleDocuments: jest.fn(),
  deleteDriverVehicle: jest.fn(),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  getDriverVehicles.mockResolvedValue([]);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

it('names missing uploads on the vehicle screen and blocks Next before creating a vehicle', async () => {
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Step 4 of 7: Vehicle details');
  expect(rendered).toContain('Missing vehicle photos and documents');
  expect(rendered).toContain('Front photo');
  expect(rendered).toContain('Insurance document');

  const next = tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next.props.onPress());

  expect(JSON.stringify(tree.toJSON())).toContain('Front photo is required.');
  expect(JSON.stringify(tree.toJSON())).toContain('Insurance document is required.');
  expect(createDriverVehicle).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});


it('shows the specific vehicle file reason and preserves other accepted files', async () => {
  const types = [
    'VEHICLE_FRONT_PHOTO',
    'VEHICLE_REAR_PHOTO',
    'VEHICLE_SIDE_PHOTO',
    'VEHICLE_LICENSE_PLATE_PHOTO',
    'VEHICLE_REGISTRATION_FRONT',
    'VEHICLE_REGISTRATION_BACK',
    'VEHICLE_INSURANCE_DOCUMENT',
  ];
  const vehicle = {
    id: 'vehicle-1', updatedAt: '2026-02-01T00:00:00.000Z',
    vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux', year: 2025,
    licensePlateNumber: 'TEST-1234', condition: 'EXCELLENT',
    status: 'REJECTED', rejectionReason: 'Rear image is blurry.',
    documents: types.map(type => ({
      id: type, type,
      status: type === 'VEHICLE_REAR_PHOTO' ? 'REJECTED' : 'APPROVED',
      rejectionReason: type === 'VEHICLE_REAR_PHOTO' ? 'Rear image is blurry.' : null,
      createdAt: '2026-02-01T00:00:00.000Z',
    })),
  };
  getDriverVehicles.mockResolvedValue([vehicle]);
  getDriverVehicle.mockResolvedValue(vehicle);
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Rear image is blurry.');
  expect(rendered).toContain('Missing vehicle photos and documents');
  expect(rendered).toContain('Rear photo');
  expect(rendered).not.toContain('Front photo is required.');
});
