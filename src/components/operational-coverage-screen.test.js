import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput, Switch } from 'react-native';
import { OperationalCoverageScreen } from './operational-coverage-screen';
import { getOperationalCoverage, requestOperationalCountry, requestRoutePermission } from '@/lib/api';
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useFocusEffect: callback => require('react').useEffect(callback, [callback]) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ accessToken: 'driver-token' }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/lib/api', () => ({ getOperationalCoverage: jest.fn(), requestOperationalCountry: jest.fn(), requestRoutePermission: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  getOperationalCoverage.mockResolvedValue({ countries: [], routes: [] });
});
const button = tree => tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Request approval')[0];
async function mount(mode) { let tree; await act(async () => { tree = create(<OperationalCoverageScreen mode={mode} />); }); return tree; }
it('submits normalized country coverage and displays the server decision', async () => {
  requestOperationalCountry.mockResolvedValue({ status: 'PENDING' });
  const tree = await mount('countries');
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('ch'));
  await act(async () => tree.root.findAllByType(Switch)[1].props.onValueChange(false));
  await act(async () => button(tree).props.onPress());
  expect(requestOperationalCountry).toHaveBeenCalledWith('CH', true, false);
  expect(JSON.stringify(tree.toJSON())).toContain('Request status: Pending');
  await act(async () => tree.unmount());
});
it('preserves route direction and an existing suspended decision', async () => {
  requestRoutePermission.mockResolvedValue({ status: 'SUSPENDED' });
  const tree = await mount('routes');
  await act(async () => {
    const inputs = tree.root.findAllByType(TextInput);
    inputs[0].props.onChangeText('FR'); inputs[1].props.onChangeText('CH');
  });
  await act(async () => button(tree).props.onPress());
  expect(requestRoutePermission).toHaveBeenCalledWith('FR', 'CH');
  expect(JSON.stringify(tree.toJSON())).toContain('Request status: Suspended');
  await act(async () => tree.unmount());
});
it('renders all approval statuses without treating rejected coverage as approved', async () => {
  getOperationalCoverage.mockResolvedValue({ countries: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map(status => ({ id: status, countryCode: 'FR', canPickup: true, canDropoff: false, status })), routes: [] });
  const tree = await mount('countries');
  for (const status of ['Pending', 'Approved', 'Rejected', 'Suspended']) expect(JSON.stringify(tree.toJSON())).toContain(status);
  await act(async () => tree.unmount());
});
it('shows a retry after load failure and does not allow a submission', async () => {
  getOperationalCoverage.mockRejectedValueOnce(new Error('Offline'));
  const tree = await mount('routes');
  expect(JSON.stringify(tree.toJSON())).toContain('Offline');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  const retry = tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.disabled === false)[0];
  await act(async () => retry.props.onPress());
  expect(tree.root.findAllByType(TextInput)).toHaveLength(2);
  await act(async () => tree.unmount());
});
it('keeps failed submissions editable for retry', async () => {
  requestOperationalCountry.mockRejectedValue(new Error('Invalid country code.'));
  const tree = await mount('countries');
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('XX'));
  await act(async () => button(tree).props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Invalid country code.');
  expect(button(tree).props.disabled).toBe(false);
  await act(async () => tree.unmount());
});
