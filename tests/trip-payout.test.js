import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import Completed from '../src/app/driver-trip-completed';
import { DriverPayoutStatusCard } from '@/components/driver-payout-status-card';
import { getStripeConnectStatus, syncStripeConnectAccount, retryTransferForTrip } from '@/lib/api';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockTripId = 'swiss-job';
const mockT = (key, values) => values ? key.replace('{{value}}', values.value) : key;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ tripId: mockTripId }), useFocusEffect: callback => { require('react').useEffect(callback, [callback]); } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/api', () => ({ getStripeConnectStatus: jest.fn(), syncStripeConnectAccount: jest.fn(), retryTransferForTrip: jest.fn() }));
jest.mock('@/location/background-trip-tracking', () => ({ stopBackgroundTripTracking: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/request-status-display', () => ({ getRequestStatusLabel: status => status }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
const ready = { stripeAccountId: 'acct_test', payoutsEnabled: true, accountStatus: 'verified' };
let tree;
const output = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(text => text.props.children === label));
async function press(label) { expect(button(label).props.disabled).not.toBe(true); await act(async () => button(label).props.onPress()); }
async function render(element) { await act(async () => { tree = create(element); }); }
beforeEach(() => {
  jest.resetAllMocks(); mockTripId = 'swiss-job';
  require('@/location/background-trip-tracking').stopBackgroundTripTracking.mockResolvedValue(undefined);
  getStripeConnectStatus.mockResolvedValue(ready);
  syncStripeConnectAccount.mockResolvedValue({});
  retryTransferForTrip.mockResolvedValue({ transferred: true, stripeTransferId: 'tr_test' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

describe.each([
  ['completed screen', () => <Completed />, 'Release Held Funds', 'Refresh Payout Status'],
  ['payout card', () => <DriverPayoutStatusCard tripId={mockTripId} requestStatus="DELIVERED" amountLabel="CHF 100.00" />, 'Release Payout', 'Refresh payout status'],
])('%s', (name, element, releaseLabel, refreshLabel) => {
  it('loads and refreshes status without releasing funds until explicitly requested', async () => {
    await render(element()); await press(refreshLabel);
    expect(retryTransferForTrip).not.toHaveBeenCalled();
    await press(releaseLabel);
    expect(retryTransferForTrip).toHaveBeenCalledWith('swiss-job');
    expect(output()).toContain('Held funds were released successfully');
    expect(output()).toContain('tr_test');
  });
  it('does not release funds while payouts are disabled', async () => {
    getStripeConnectStatus.mockResolvedValue({ ...ready, payoutsEnabled: false });
    await render(element());
    if (button(releaseLabel) && !button(releaseLabel).props.disabled) await press(releaseLabel);
    expect(retryTransferForTrip).not.toHaveBeenCalled(); expect(output()).toContain('not enabled');
  });
  it('shows server denial without success and permits explicit retry', async () => {
    retryTransferForTrip.mockRejectedValueOnce(new Error('Request access denied'));
    await render(element()); await press(releaseLabel);
    expect(output()).toContain('Request access denied'); expect(output()).not.toContain('released successfully');
    await press(releaseLabel); expect(retryTransferForTrip).toHaveBeenCalledTimes(2);
    expect(output()).toContain('released successfully');
  });
  it('preserves the backend explanation when no new transfer is created', async () => {
    retryTransferForTrip.mockResolvedValue({ transferred: false, reason: 'Payment still pending' });
    await render(element()); await press(releaseLabel);
    expect(output()).toContain('Payment still pending'); expect(output()).not.toContain('released successfully');
  });
  it('prevents duplicate release requests while the prerequisite status load is pending', async () => {
    await render(element());
    let resolveStatus;
    getStripeConnectStatus.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
    const release = button(releaseLabel).props.onPress;
    await act(async () => { release(); release(); });
    await act(async () => resolveStatus(ready));
    expect(retryTransferForTrip).toHaveBeenCalledTimes(1);
  });
  it('does not release the previous trip after navigating while status is pending', async () => {
    await render(element());
    let resolveStatus;
    getStripeConnectStatus.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
    await press(releaseLabel);
    mockTripId = 'other-job';
    await act(async () => tree.update(element()));
    await act(async () => resolveStatus(ready));
    expect(retryTransferForTrip).not.toHaveBeenCalled();
  });
  it('does not release funds after leaving during account synchronization', async () => {
    await render(element());
    let resolveSync;
    syncStripeConnectAccount.mockImplementationOnce(() => new Promise(resolve => { resolveSync = resolve; }));
    await press(releaseLabel);
    await act(async () => tree.unmount()); tree = null;
    await act(async () => resolveSync({}));
    expect(retryTransferForTrip).not.toHaveBeenCalled();
  });
  it('does not release funds for an invalid trip ID', async () => {
    mockTripId = 'bad'; await render(element());
    expect(button(releaseLabel)).toBeUndefined();
    expect(retryTransferForTrip).not.toHaveBeenCalled();
  });
  it('recovers from a failed status load through refresh without releasing funds', async () => {
    getStripeConnectStatus.mockRejectedValueOnce(new Error('Status unavailable'));
    await render(element()); expect(output()).toContain('Status unavailable');
    await press(refreshLabel); expect(output()).not.toContain('Status unavailable');
    expect(retryTransferForTrip).not.toHaveBeenCalled();
  });
  it('does not display a previous trip transfer result on the next trip', async () => {
    await render(element()); await press(releaseLabel);
    mockTripId = 'other-job';
    await act(async () => tree.update(element()));
    expect(output()).not.toContain('tr_test'); expect(output()).not.toContain('released successfully');
  });
  it('ignores a late transfer response after changing trips', async () => {
    let resolveTransfer;
    retryTransferForTrip.mockImplementationOnce(() => new Promise(resolve => { resolveTransfer = resolve; }));
    await render(element()); await press(releaseLabel);
    mockTripId = 'other-job'; await act(async () => tree.update(element()));
    await act(async () => resolveTransfer({ transferred: true, stripeTransferId: 'tr_previous' }));
    expect(output()).not.toContain('tr_previous'); expect(output()).not.toContain('released successfully');
  });
});
it.each(['DRIVER_ASSIGNED', 'IN_TRANSIT', 'CANCELLED'])('does not offer payout release for %s', async requestStatus => {
  await render(<DriverPayoutStatusCard tripId="swiss-job" requestStatus={requestStatus} amountLabel="CHF 100.00" />);
  expect(button('Release Payout')).toBeUndefined(); expect(output()).toContain('CHF 100.00');
  expect(retryTransferForTrip).not.toHaveBeenCalled();
});
