import React from 'react';
import { act, create } from 'react-test-renderer';

import VehicleInformationScreen from './vehicle-information';
import { createDriverVehicle, deleteDriverVehicle, getDriverVehicle, getDriverVehicles, updateDriverVehicle, uploadDriverVehicleDocuments } from '@/lib/api';
import { clearVehicleInformationDraft, persistVehicleInformationDraft, readVehicleInformationDraft } from '@/lib/auth-storage';

const mockRouter = { replace: jest.fn() };
let mockParams = { flow: 'onboarding' };
const mockT = (key, values) => values?.label ? key.replace('{{label}}', values.label) : key;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
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
  mockParams = { flow: 'onboarding' };
  getDriverVehicles.mockResolvedValue([]);
  readVehicleInformationDraft.mockResolvedValue(null);
  clearVehicleInformationDraft.mockResolvedValue(undefined);
  persistVehicleInformationDraft.mockResolvedValue(undefined);
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

const uploadFields = [
  'frontPhoto', 'rearPhoto', 'sidePhoto', 'licensePlatePhoto',
  'registrationFrontDocument', 'registrationBackDocument', 'insuranceDocument',
];
const validDraft = () => ({
  vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux', year: '2025',
  licensePlateNumber: 'ABC-987', condition: 'GOOD',
  insuranceExpiryDate: '', registrationExpiryDate: '',
  ...Object.fromEntries(uploadFields.map(field => [field, {
    uri: `file://${field}.jpg`, mimeType: 'image/jpeg', fileSize: 100,
  }])),
});

it('starts a new registration with empty required vehicle fields', async () => {
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Select vehicle type');
  expect(rendered).toContain('Select vehicle brand');
  expect(rendered).not.toContain('Hilux');
  expect(rendered).not.toContain('TEST-1234');
  expect(readVehicleInformationDraft).toHaveBeenCalledWith('new');
  const next = tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next.props.onPress());
  expect(rendered).not.toContain('Vehicle type is required.');
  expect(JSON.stringify(tree.toJSON())).toContain('Vehicle type is required.');
  expect(createDriverVehicle).not.toHaveBeenCalled();
});

it('preserves a created vehicle and retries its upload after an upload failure', async () => {
  readVehicleInformationDraft.mockResolvedValue(JSON.stringify(validDraft()));
  const savedVehicle = {
    id: 'saved-vehicle', vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux',
    year: 2025, licensePlateNumber: 'ABC-987', condition: 'GOOD', documents: [],
  };
  createDriverVehicle.mockResolvedValue(savedVehicle);
  updateDriverVehicle.mockResolvedValue(savedVehicle);
  uploadDriverVehicleDocuments.mockRejectedValueOnce(new Error('Upload unavailable'))
    .mockResolvedValueOnce({ vehicle: savedVehicle });
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const next = () => tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next().props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Upload unavailable');
  expect(createDriverVehicle).toHaveBeenCalledTimes(1);
  expect(deleteDriverVehicle).not.toHaveBeenCalled();
  expect(persistVehicleInformationDraft).toHaveBeenCalledWith('saved-vehicle', expect.any(String));
  expect(clearVehicleInformationDraft).not.toHaveBeenCalledWith('saved-vehicle');
  await act(async () => next().props.onPress());
  expect(createDriverVehicle).toHaveBeenCalledTimes(1);
  expect(updateDriverVehicle).not.toHaveBeenCalled();
  expect(uploadDriverVehicleDocuments).toHaveBeenCalledTimes(2);
  expect(clearVehicleInformationDraft).toHaveBeenCalledWith('saved-vehicle');
});

it('does not undo a saved vehicle when local draft cleanup fails', async () => {
  readVehicleInformationDraft.mockResolvedValue(JSON.stringify(validDraft()));
  const savedVehicle = { id: 'saved-vehicle', documents: [] };
  createDriverVehicle.mockResolvedValue(savedVehicle);
  uploadDriverVehicleDocuments.mockResolvedValue({ vehicle: savedVehicle });
  clearVehicleInformationDraft.mockRejectedValue(new Error('Storage unavailable'));
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const next = tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next.props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Vehicle saved successfully.');
  expect(deleteDriverVehicle).not.toHaveBeenCalled();
  expect(updateDriverVehicle).not.toHaveBeenCalled();
});

it('does not roll back an updated vehicle after its document upload fails', async () => {
  mockParams = { flow: 'onboarding', vehicleId: 'vehicle-1' };
  const existing = {
    id: 'vehicle-1', vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux',
    year: 2025, licensePlateNumber: 'ABC-987', condition: 'GOOD',
    insuranceExpiryDate: null, registrationExpiryDate: null,
    documents: uploadFields.map((_, index) => ({
      id: String(index), type: [
        'VEHICLE_FRONT_PHOTO', 'VEHICLE_REAR_PHOTO', 'VEHICLE_SIDE_PHOTO',
        'VEHICLE_LICENSE_PLATE_PHOTO', 'VEHICLE_REGISTRATION_FRONT',
        'VEHICLE_REGISTRATION_BACK', 'VEHICLE_INSURANCE_DOCUMENT',
      ][index], status: 'APPROVED', createdAt: '2026-01-01',
    })),
  };
  getDriverVehicle.mockResolvedValue(existing);
  readVehicleInformationDraft.mockResolvedValue(JSON.stringify({
    ...validDraft(), licensePlateNumber: 'NEW-987',
  }));
  updateDriverVehicle.mockResolvedValue({ ...existing, licensePlateNumber: 'NEW-987' });
  uploadDriverVehicleDocuments.mockRejectedValue(new Error('Upload unavailable'));
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const next = tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next.props.onPress());
  expect(updateDriverVehicle).toHaveBeenCalledTimes(1);
  expect(updateDriverVehicle).toHaveBeenCalledWith('vehicle-1', expect.objectContaining({
    licensePlateNumber: 'NEW-987',
  }));
  expect(deleteDriverVehicle).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Upload unavailable');
});

it('retries a date-only document update without saving the vehicle again', async () => {
  mockParams = { flow: 'onboarding', vehicleId: 'vehicle-1' };
  const documentTypes = [
    'VEHICLE_FRONT_PHOTO', 'VEHICLE_REAR_PHOTO', 'VEHICLE_SIDE_PHOTO',
    'VEHICLE_LICENSE_PLATE_PHOTO', 'VEHICLE_REGISTRATION_FRONT',
    'VEHICLE_REGISTRATION_BACK', 'VEHICLE_INSURANCE_DOCUMENT',
  ];
  const existing = {
    id: 'vehicle-1', vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux',
    year: 2025, licensePlateNumber: 'ABC-987', condition: 'GOOD',
    insuranceExpiryDate: null, registrationExpiryDate: null,
    documents: documentTypes.map((type, index) => ({
      id: String(index), type, status: 'APPROVED', createdAt: '2026-01-01',
    })),
  };
  getDriverVehicle.mockResolvedValue(existing);
  readVehicleInformationDraft.mockResolvedValue(JSON.stringify({
    vehicleType: 'PICKUP', brand: 'Toyota', model: 'Hilux', year: '2025',
    licensePlateNumber: 'ABC-987', condition: 'GOOD',
    insuranceExpiryDate: '2030-01-01', registrationExpiryDate: '',
  }));
  const saved = { ...existing, insuranceExpiryDate: '2030-01-01' };
  updateDriverVehicle.mockResolvedValue(saved);
  uploadDriverVehicleDocuments.mockRejectedValueOnce(new Error('Date upload unavailable'))
    .mockResolvedValueOnce({ vehicle: saved });
  await act(async () => { tree = create(<VehicleInformationScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const next = () => tree.root.findAll(node => node.props.accessibilityLabel === 'Next')[0];
  await act(async () => next().props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Date upload unavailable');
  await act(async () => next().props.onPress());
  expect(updateDriverVehicle).toHaveBeenCalledTimes(1);
  expect(uploadDriverVehicleDocuments).toHaveBeenCalledTimes(2);
  expect(uploadDriverVehicleDocuments).toHaveBeenLastCalledWith('vehicle-1',
    expect.objectContaining({ insuranceExpiryDate: '2030-01-01' }));
});
