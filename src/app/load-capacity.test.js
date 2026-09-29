import React from 'react';
import { act, create } from 'react-test-renderer';

import LoadCapacityScreen from './load-capacity';
import { getDriverVehicle, getVehicleLoadCapacity, saveVehicleLoadCapacity } from '@/lib/api';
import { clearLoadCapacityDraft } from '@/lib/auth-storage';

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
