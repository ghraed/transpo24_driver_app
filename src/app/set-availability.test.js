import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

import SetAvailabilityScreen from './set-availability';

const mockRouter = { replace: jest.fn() };
const mockRefreshAvailability = jest.fn();
const mockSaveAvailability = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({
  driver: { countryCode: 'LB', cities: [] },
  refreshDriverAvailability: mockRefreshAvailability,
  saveDriverAvailability: mockSaveAvailability,
  signOut: jest.fn(),
}) }));
jest.mock('@/components/city-coverage-editor', () => ({ CityCoverageEditor: () => null }));
jest.mock('@/components/native-maps', () => ({
  isNativeMapRuntimeAvailable: false, NativeMapView: null, NativeMarker: null,
}));
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'http://localhost' }));
jest.mock('@/config/maps', () => ({ HAS_GOOGLE_MAPS_API_KEY: false }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/auth-storage', () => ({
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}));

const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
let tree;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  mockRefreshAvailability.mockResolvedValue({
    timezone: 'Asia/Beirut', isOnline: false, serviceRadiusKm: 30,
    baseLatitude: 33.9, baseLongitude: 35.5, baseAddress: 'Beirut',
    acceptsImmediateRequests: true, acceptsScheduledRequests: false,
    cityCoverage: [], weeklySchedule: days.map(dayOfWeek => ({
      dayOfWeek, isAvailable: dayOfWeek === 'MONDAY',
      startTime: '08:00', endTime: '18:00',
    })),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.restoreAllMocks();
});

async function renderAndSave() {
  await act(async () => { tree = create(<SetAvailabilityScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const save = tree.root.findAll(node => typeof node.props.onPress === 'function' &&
    node.findAllByType && node.findAllByType('Text').some(child => child.props.children === 'Save & Continue'))[0];
  expect(save.props.disabled).toBe(false);
  await act(async () => save.props.onPress());
}

it('shows a vehicle prerequisite backend failure as an error and stays on availability', async () => {
  mockSaveAvailability.mockRejectedValue(new Error('Vehicle documents are missing'));
  await renderAndSave();
  expect(JSON.stringify(tree.toJSON())).toContain('Vehicle documents are missing');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Continuing to approval');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('does not show success when the server still requires availability', async () => {
  mockSaveAvailability.mockResolvedValue({ nextStep: 'SET_AVAILABILITY', isOnline: false, serviceRadiusKm: 30 });
  await renderAndSave();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Please complete all required availability fields.');
  expect(rendered).not.toContain('Availability saved.');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
