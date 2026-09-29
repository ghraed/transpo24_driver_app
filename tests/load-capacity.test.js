import React from 'react';
import { act, create } from 'react-test-renderer';

import LoadCapacityScreen from '../src/app/load-capacity';
import { getDriverVehicle, getVehicleLoadCapacity, saveVehicleLoadCapacity } from '@/lib/api';
import { clearLoadCapacityDraft, readLoadCapacityDraft } from '@/lib/auth-storage';

const mockRouter = { replace: jest.fn() };
const mockT = key => key;
const mockVehicle = {
  id: 'vehicle-1', brand: 'Ford', model: 'Transit', year: 2024,
  vehicleType: 'VAN', allowedCargoTypes: ['GOODS'],
  capacityKg: 1200, lengthCm: 250, widthCm: 180, heightCm: 170,
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ vehicleId: 'vehicle-1', flow: 'onboarding' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/api', () => ({
  getDriverVehicle: jest.fn(), getVehicleLoadCapacity: jest.fn(), saveVehicleLoadCapacity: jest.fn(),
}));
jest.mock('@/lib/auth-storage', () => ({
  readLoadCapacityDraft: jest.fn().mockResolvedValue(null),
  persistLoadCapacityDraft: jest.fn().mockResolvedValue(undefined),
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearLoadCapacityDraft: jest.fn().mockResolvedValue(undefined),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  getDriverVehicle.mockResolvedValue(mockVehicle);
  readLoadCapacityDraft.mockResolvedValue(null);
  clearLoadCapacityDraft.mockResolvedValue(undefined);
  getVehicleLoadCapacity.mockResolvedValue(null);
  saveVehicleLoadCapacity.mockResolvedValue({ allowedCargoTypes: ['GOODS'] });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

it('keeps the server-saved capacity and opens check details even if draft cleanup fails', async () => {
  clearLoadCapacityDraft.mockRejectedValue(new Error('Local storage unavailable'));
  await act(async () => { tree = create(<LoadCapacityScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const saveButton = tree.root.findAll(node => typeof node.props.onPress === 'function'
    && node.findAllByType && node.findAllByType('Text').some(child => child.props.children === 'Continue to check details'))[0];
  expect(saveButton.props.disabled).toBe(false);
  await act(async () => saveButton.props.onPress());
  expect(saveVehicleLoadCapacity).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/check-details?vehicleId=vehicle-1');
});

it('leaves new capacity measurements empty and reads only this vehicle draft', async () => {
  getDriverVehicle.mockResolvedValue({ ...mockVehicle,
    capacityKg: null, lengthCm: null, widthCm: null, heightCm: null,
    allowedCargoTypes: [],
  });
  await act(async () => { tree = create(<LoadCapacityScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(readLoadCapacityDraft).toHaveBeenCalledWith('vehicle-1');
  const inputs = tree.root.findAllByType('TextInput').map(node => node.props.value);
  expect(inputs.slice(0, 5)).toEqual(['', '', '', '', '']);
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Maximum load capacity is required');
});
