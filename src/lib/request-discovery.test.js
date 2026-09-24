import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import Screen from '@/app/receive-requests';
import { getDriverRequestAlerts } from '@/lib/api';
import { readAccessToken } from '@/lib/auth-storage';
import { onRequestDeleted } from '@/services/socketService';

const mockRouter = { push: jest.fn() };
const mockT = key => key;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/api', () => ({ getDriverRequestAlerts: jest.fn() }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn() }));
jest.mock('@/location/request-matching-location', () => ({ syncRequestMatchingLocation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/socketService', () => ({ connectSocket: jest.fn(), onRequestDeleted: jest.fn() }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: jest.fn().mockResolvedValue({}) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ language: 'en', locale: 'en' }) }));
jest.mock('@/localization/format', () => ({ formatDateTime: value => value }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: 'DriverBottomNav', DRIVER_BOTTOM_NAV_HEIGHT: 60 }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: 'DriverIcon' }));
jest.mock('@/components/driver-job-switcher', () => ({ DriverJobSwitcher: 'DriverJobSwitcher' }));
jest.mock('@/components/request-type-tabs', () => ({ RequestTypeTabs: 'RequestTypeTabs' }));
jest.mock('@/components/request-coverage-notice', () => ({ RequestCoverageNotice: 'RequestCoverageNotice' }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

const candidate = {
  alertId: 'candidate', requestId: 'swiss-job', currency: 'EUR',
  pickupCountryCode: 'CH', destinationCountryCode: 'FR',
  pickup: { address: 'Geneva' }, dropoff: { address: 'Lyon' },
  schedule: { isImmediate: true }, service: { nameEn: 'Furniture' },
};
let tree;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  readAccessToken.mockResolvedValue('token');
  onRequestDeleted.mockReturnValue(jest.fn());
  getDriverRequestAlerts.mockResolvedValue({ alerts: [candidate] });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.useRealTimers();
});
async function render() { await act(async () => { tree = create(<Screen />); }); }

it('renders only server candidate jobs and opens the authorized ID without a home-market filter', async () => {
  await render();
  const output = tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join(' ');
  expect(output).toContain('Geneva');
  expect(output).toContain('EUR —');
  expect(output).toContain('CH');
  expect(output).toContain('FR');
  const card = tree.root.findAll(node => typeof node.props.onPress === 'function' && typeof node.props.style === 'function')[0];
  await act(async () => card.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/review-request-details', params: { requestId: 'swiss-job' } });
});
it.each([null, '', 'invalid'])('does not invent CHF for missing or invalid currency %s', async currency => {
  getDriverRequestAlerts.mockResolvedValue({ alerts: [{ ...candidate, currency }] });
  await render();
  expect(tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join(' ')).not.toContain('CHF');
});
it('removes a candidate when a policy-aware refresh no longer returns it', async () => {
  await render();
  getDriverRequestAlerts.mockResolvedValue({ alerts: [] });
  await act(async () => jest.advanceTimersByTime(20000));
  expect(tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join(' ')).not.toContain('Geneva');
  expect(tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join(' ')).toContain('No immediate requests');
});
it('removes deleted requests immediately', async () => {
  await render();
  await act(async () => onRequestDeleted.mock.calls[0][0]({ requestId: 'swiss-job' }));
  expect(tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join(' ')).not.toContain('Geneva');
});
it('does not subscribe after the screen leaves while token storage is pending', async () => {
  let resolveToken;
  readAccessToken.mockImplementation(() => new Promise(resolve => { resolveToken = resolve; }));
  await render();
  await act(async () => tree.unmount());
  tree = undefined;
  await act(async () => resolveToken('token'));
  expect(onRequestDeleted).not.toHaveBeenCalled();
});
