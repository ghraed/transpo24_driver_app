import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import AcceptedJobs from '../src/app/accepted-jobs';
import Jobs from '../src/app/receive-requests';
import { getDriverAcceptedJobs, getDriverChatRooms, getDriverRequestAlerts } from '@/lib/api';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockSignOut = jest.fn();
const mockT = key => key;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: callback => { require('react').useEffect(callback, [callback]); } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ language: 'en', locale: 'en-GB' }) }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: e => e.message }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null, DRIVER_BOTTOM_NAV_HEIGHT: 76 }));
jest.mock('@/components/driver-job-switcher', () => ({ DriverJobSwitcher: () => null }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: async () => null }));
jest.mock('@/lib/api', () => ({ getDriverAcceptedJobs: jest.fn(), getDriverChatRooms: jest.fn(), getDriverRequestAlerts: jest.fn() }));
jest.mock('@/services/socketService', () => ({ connectSocket: jest.fn(), onRequestDeleted: jest.fn(() => () => {}) }));
jest.mock('@/services/translation-service', () => ({ translateDynamicBatch: async () => ({}) }));

const job = {
  requestId: 'cmtsntl950008zrfvvpsmm616', requestStatus: 'DRIVER_GOING_TO_PICKUP',
  service: { key: 'VEHICLE_TRANSPORT', nameEn: 'Vehicle transport' },
  pickup: { latitude: 1, longitude: 1, address: 'Test pickup' },
  dropoff: { latitude: 2, longitude: 2, address: 'Test dropoff' },
  schedule: { isImmediate: false, scheduledPickupAt: '2026-09-09T12:00:00Z' },
  item: { title: 'Test vehicle' }, acceptedOffer: { price: 100, currency: 'EUR' }, acceptedAt: null,
};
const alert = { ...job, requestStatus: 'QUOTED', alertId: 'alert', alertStatus: 'ACCEPTED' };
let tree;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  getDriverAcceptedJobs.mockResolvedValue({ jobs: [job] });
  getDriverChatRooms.mockResolvedValue({ rooms: [] });
  getDriverRequestAlerts.mockResolvedValue({ alerts: [alert] });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function render(Screen) { await act(async () => { tree = create(<Screen />); }); }
function renderedText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(renderedText).join('');
  return renderedText(node.children);
}
function contains(text) { return renderedText(tree.toJSON()).includes(text); }
it('shows an active accepted job immediately even while chat badges are still loading', async () => {
  getDriverChatRooms.mockReturnValue(new Promise(() => {}));
  await render(AcceptedJobs);
  expect(contains('CMTSNTL9')).toBe(true);
  expect(contains('Test vehicle')).toBe(true);
});
it('restores an accepted job after leaving and reopening the list', async () => {
  await render(AcceptedJobs); await act(async () => tree.unmount()); tree = null;
  await render(AcceptedJobs);
  expect(contains('CMTSNTL9')).toBe(true);
  expect(getDriverAcceptedJobs).toHaveBeenCalledTimes(2);
});
it('does not let an older empty response erase a newer accepted job', async () => {
  let resolveOld;
  getDriverAcceptedJobs.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  await render(AcceptedJobs);
  await act(async () => jest.advanceTimersByTime(25000));
  expect(contains('CMTSNTL9')).toBe(true);
  await act(async () => resolveOld({ jobs: [] }));
  expect(contains('CMTSNTL9')).toBe(true);
});
it('keeps an accepted job visible if a background refresh fails', async () => {
  await render(AcceptedJobs);
  getDriverAcceptedJobs.mockRejectedValue(new Error('Network unavailable'));
  await act(async () => jest.advanceTimersByTime(25000));
  expect(contains('CMTSNTL9')).toBe(true);
  expect(contains('Network unavailable')).toBe(true);
});
it('removes finished accepted jobs when the server confirms completion', async () => {
  await render(AcceptedJobs);
  getDriverAcceptedJobs.mockResolvedValue({ jobs: [{ ...job, requestStatus: 'COMPLETED' }] });
  await act(async () => jest.advanceTimersByTime(25000));
  expect(contains('CMTSNTL9')).toBe(false);
});
it('keeps opened scheduled jobs accessible after leaving and reopening Jobs', async () => {
  await render(Jobs); expect(contains('Test pickup')).toBe(true);
  await act(async () => tree.unmount()); tree = null;
  await render(Jobs); expect(contains('Test pickup')).toBe(true);
});
it('keeps available jobs on a refresh failure, then removes them when another driver books them', async () => {
  await render(Jobs);
  getDriverRequestAlerts.mockRejectedValueOnce(new Error('Network unavailable'));
  await act(async () => jest.advanceTimersByTime(20000));
  expect(contains('Test pickup')).toBe(true);
  getDriverRequestAlerts.mockResolvedValue({ alerts: [] });
  await act(async () => jest.advanceTimersByTime(20000));
  expect(contains('Test pickup')).toBe(false);
});
