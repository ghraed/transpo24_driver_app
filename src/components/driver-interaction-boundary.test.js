import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { notifyDriverApprovalRequired } from '@/lib/driver-approval-events';
import { DriverInteractionBoundary } from './driver-interaction-boundary';

let mockPath = '/receive-requests';
let mockDriver = { status: 'PENDING_PROFILE', isProfileCompleted: false };
const mockRefresh = jest.fn();
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useRouter: () => mockRouter }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ accessToken: 'token', driver: mockDriver, refreshDriverMe: mockRefresh }) }));
let tree;
beforeEach(() => { jest.clearAllMocks(); mockDriver = { status: 'PENDING_PROFILE', isProfileCompleted: false }; });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; });
const render = () => act(async () => { tree = create(<DriverInteractionBoundary><Text>Screen</Text></DriverInteractionBoundary>); });

test('lets a phone-verified incomplete driver browse without forcing registration', async () => {
  mockPath = '/receive-requests';
  await render();
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(View).some(node => node.props.pointerEvents === 'none')).toBe(false);
});
test.each([
  ['PENDING_PROFILE', false, 'COMPLETE_PROFILE', '/complete-profile'],
  ['PENDING_DOCUMENTS', true, 'UPLOAD_DOCUMENTS', '/vehicle-documents'],
  ['PENDING_REVIEW', true, 'WAITING_APPROVAL', '/waiting-approval'],
])('redirects a %s driver attempting client interaction', async (status, isProfileCompleted, nextStep, target) => {
  mockPath = '/send-price-offer';
  mockRefresh.mockResolvedValue({ driver: { status, isProfileCompleted }, nextStep });
  await render();
  expect(mockRouter.replace).toHaveBeenCalledWith(target);
  expect(tree.root.findAllByType(View).some(node => node.props.pointerEvents === 'none')).toBe(true);
});
test('waits for fresh approval before enabling a client screen', async () => {
  mockPath = '/chat';
  mockDriver = { status: 'APPROVED', isProfileCompleted: true };
  let resolve;
  mockRefresh.mockReturnValue(new Promise(done => { resolve = done; }));
  await render();
  expect(tree.root.findAllByType(View).some(node => node.props.pointerEvents === 'none')).toBe(true);
  await act(async () => resolve({ driver: mockDriver, nextStep: 'HOME' }));
  expect(tree.root.findAllByType(View).some(node => node.props.pointerEvents === 'none')).toBe(false);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
test('redirects when admin approval has been revoked since sign-in', async () => {
  mockPath = '/chat';
  mockDriver = { status: 'APPROVED', isProfileCompleted: true };
  mockRefresh.mockResolvedValue({ driver: { status: 'SUSPENDED', isProfileCompleted: true }, nextStep: 'WAITING_APPROVAL' });
  await render();
  expect(mockRouter.replace).toHaveBeenCalledWith('/waiting-approval');
});

test('redirects an already-open client screen when an API action reports revoked approval', async () => {
  mockPath = '/chat';
  mockDriver = { status: 'APPROVED', isProfileCompleted: true };
  mockRefresh.mockResolvedValue({ driver: mockDriver, nextStep: 'HOME' });
  await render();
  mockRefresh.mockResolvedValue({ driver: { status: 'SUSPENDED', isProfileCompleted: true }, nextStep: 'WAITING_APPROVAL' });
  await act(async () => notifyDriverApprovalRequired());
  expect(mockRouter.replace).toHaveBeenCalledWith('/waiting-approval');
});
