import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import ReceiveRequestAlertsScreen from '@/app/receive-requests';

const mockPush = jest.fn();
const mockGetAlerts = jest.fn();
const mockT = key => key;
const mockLocale = { language: 'en', locale: 'en', isRTL: false };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/use-driver-access', () => ({ useDriverAccess: () => ({ canInteract: false }) }));
jest.mock('@/components/driver-registration-notice', () => ({ DriverRegistrationNotice: () => require('react').createElement(require('react-native').Text, null, 'Registration notice') }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null, DRIVER_BOTTOM_NAV_HEIGHT: 80 }));
jest.mock('@/components/driver-job-switcher', () => ({ DriverJobSwitcher: () => null }));
jest.mock('@/components/request-coverage-notice', () => ({ RequestCoverageNotice: () => null }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: jest.fn() }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn(async () => null) }));
jest.mock('@/lib/api', () => ({ getDriverRequestAlerts: (...args) => mockGetAlerts(...args) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => mockLocale }));
jest.mock('@/localization/format', () => ({ formatDateTime: value => value }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { language: 'en' } }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn(async () => ({})) }));
jest.mock('@/services/socketService', () => ({ connectSocket: jest.fn(), onRequestNew: jest.fn(), onRequestDeleted: jest.fn() }));

let tree;
const labels = () => tree.root.findAllByType(Text).map(node => node.props.children);
const button = label => {
  let node = tree.root.findAllByType(Text).find(node => node.props.children === label);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  return node;
};
const render = async () => { await act(async () => { tree = create(<ReceiveRequestAlertsScreen />); }); };
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockLocale.isRTL = false;
});
afterEach(async () => { await act(async () => tree?.unmount()); jest.useRealTimers(); });

test.each([false, true])('incomplete profile gets a setup card and opens the profile form (RTL: %s)', async isRTL => {
  mockLocale.isRTL = isRTL;
  // The source message remains English even when the displayed API error is localized.
  mockGetAlerts.mockRejectedValue(Object.assign(new Error('يجب إكمال ملف تعريف السائق أولاً.'), {
    sourceMessage: 'Driver profile must be completed first.',
  }));
  await render();
  expect(labels()).toContain('Complete your driver profile');
  expect(labels()).not.toContain('Try again');
  expect(labels()).not.toContain('Registration notice');
  await act(async () => button('Finish Profile').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/complete-profile');
});

test('connection errors keep the retry action and recover to the request list', async () => {
  mockGetAlerts.mockRejectedValueOnce(new Error('Network unavailable'));
  await render();
  expect(labels()).toContain('Network unavailable');
  expect(labels()).not.toContain('Finish Profile');
  mockGetAlerts.mockResolvedValue({ alerts: [] });
  await act(async () => button('Try again').props.onPress());
  expect(mockGetAlerts).toHaveBeenCalledTimes(2);
  expect(labels()).toContain('No immediate requests');
});

test('the profile card stays visible during polling and clears when requests become available', async () => {
  mockGetAlerts.mockRejectedValue(new Error('Driver profile must be completed first.'));
  await render();
  let resolve;
  mockGetAlerts.mockReturnValue(new Promise(done => { resolve = done; }));
  await act(async () => jest.advanceTimersByTime(20000));
  expect(labels()).toContain('Finish Profile');
  await act(async () => resolve({ alerts: [] }));
  expect(labels()).not.toContain('Finish Profile');
  expect(labels()).toContain('No immediate requests');
});
