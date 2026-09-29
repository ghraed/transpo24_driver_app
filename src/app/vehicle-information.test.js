import React from 'react';
import { act, create } from 'react-test-renderer';

import VehicleInformationScreen from './vehicle-information';
import { createDriverVehicle, getDriverVehicles } from '@/lib/api';

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
