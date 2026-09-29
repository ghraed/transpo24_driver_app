import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

import WaitingApprovalScreen from './waiting-approval';
import { getDriverDocumentsStatus, getDriverVehicles } from '@/lib/api';

const mockRouter = { replace: jest.fn() };
const mockRefreshDriverMe = jest.fn();
let mockDriverStatus = 'REJECTED';
let mockFocused = true;
let mockFocusVersion = 0;
let mockAppStateHandler;
const mockT = key => key;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: callback => require('react').useEffect(
    () => mockFocused ? callback() : undefined,
    [callback, mockFocusVersion],
  ),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({ driver: { status: mockDriverStatus }, refreshDriverMe: mockRefreshDriverMe }),
}));
jest.mock('@/lib/api', () => ({
  getDriverDocumentsStatus: jest.fn(),
  getDriverVehicles: jest.fn(),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  mockDriverStatus = 'REJECTED';
  mockFocused = true;
  mockFocusVersion = 0;
  mockAppStateHandler = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'change') mockAppStateHandler = handler;
    return { remove: jest.fn() };
  });
  getDriverDocumentsStatus.mockResolvedValue({
    uploadedDocuments: [{ status: 'REJECTED', rejectionReason: 'Replace the blurry ID photo.' }],
  });
  getDriverVehicles.mockResolvedValue([]);
  mockRefreshDriverMe.mockResolvedValue({
    driver: { status: 'REJECTED' },
    nextStep: 'WAITING_APPROVAL',
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.restoreAllMocks();
});

const button = label => tree.root.findAll(
  node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
)[0];

const renderScreen = async () => {
  await act(async () => { tree = create(<WaitingApprovalScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};

it('shows the decline reason and opens the correction flow', async () => {
  await renderScreen();
  expect(JSON.stringify(tree.toJSON())).toContain('Replace the blurry ID photo.');
  expect(button('Fix submission')).toBeDefined();
  await act(async () => button('Fix submission').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-documents');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Back to home');
});

it('uses the vehicle reason when document feedback is unavailable', async () => {
  getDriverDocumentsStatus.mockRejectedValue(new Error('offline'));
  getDriverVehicles.mockResolvedValue([{ status: 'REJECTED', rejectionReason: 'Upload a readable registration card.' }]);
  await renderScreen();
  expect(JSON.stringify(tree.toJSON())).toContain('Upload a readable registration card.');
  expect(button('Fix submission')).toBeDefined();
});

it('keeps the correction action available when review details cannot be loaded', async () => {
  getDriverDocumentsStatus.mockRejectedValue(new Error('offline'));
  getDriverVehicles.mockRejectedValue(new Error('offline'));
  await renderScreen();
  expect(JSON.stringify(tree.toJSON())).toContain('Unable to load review details.');
  expect(button('Fix submission')).toBeDefined();
});

it('keeps pending drivers in review and checks status on focus', async () => {
  mockDriverStatus = 'PENDING_REVIEW';
  mockRefreshDriverMe.mockResolvedValue({ driver: { status: 'PENDING_REVIEW' }, nextStep: 'WAITING_APPROVAL' });
  await renderScreen();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Step 6 of 7: Admin review');
  expect(rendered).toContain('Review times vary. Check your status in the app; you may also receive a notification when a decision is made.');
  expect(rendered).toContain('Pending review');
  expect(rendered).not.toContain('Back to home');
  expect(button('Fix submission')).toBeUndefined();
  expect(mockRefreshDriverMe).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalledWith('/receive-requests');
  expect(getDriverDocumentsStatus).not.toHaveBeenCalled();
  expect(getDriverVehicles).not.toHaveBeenCalled();
});

it('refreshes again when the screen regains focus or the app becomes active', async () => {
  mockDriverStatus = 'PENDING_REVIEW';
  mockRefreshDriverMe.mockResolvedValue({ driver: { status: 'PENDING_REVIEW' }, nextStep: 'WAITING_APPROVAL' });
  await renderScreen();
  await act(async () => {
    mockFocused = false;
    mockFocusVersion += 1;
    tree.update(<WaitingApprovalScreen />);
  });
  await act(async () => {
    mockFocused = true;
    mockFocusVersion += 1;
    tree.update(<WaitingApprovalScreen />);
  });
  expect(mockRefreshDriverMe).toHaveBeenCalledTimes(2);
  await act(async () => mockAppStateHandler('active'));
  expect(mockRefreshDriverMe).toHaveBeenCalledTimes(3);
});

it('ignores a stale approval response and refreshes after returning to the screen', async () => {
  mockDriverStatus = 'PENDING_REVIEW';
  let finishFirstRefresh;
  mockRefreshDriverMe.mockImplementationOnce(() => new Promise((resolve) => {
    finishFirstRefresh = resolve;
  })).mockResolvedValue({ driver: { status: 'PENDING_REVIEW' }, nextStep: 'WAITING_APPROVAL' });
  await renderScreen();
  await act(async () => {
    mockFocused = false;
    mockFocusVersion += 1;
    tree.update(<WaitingApprovalScreen />);
  });
  await act(async () => {
    mockFocused = true;
    mockFocusVersion += 1;
    tree.update(<WaitingApprovalScreen />);
  });
  await act(async () => finishFirstRefresh({ driver: { status: 'APPROVED' }, nextStep: 'HOME' }));
  expect(mockRouter.replace).not.toHaveBeenCalledWith('/receive-requests');
  expect(mockRefreshDriverMe).toHaveBeenCalledTimes(2);
});

it('routes an approved driver onward without a manual refresh', async () => {
  mockRefreshDriverMe.mockResolvedValue({ driver: { status: 'APPROVED' }, nextStep: 'SET_AVAILABILITY' });
  await renderScreen();
  expect(mockRouter.replace).toHaveBeenCalledWith('/set-availability');
});

it('keeps the manual refresh action for retrying after a status error', async () => {
  mockDriverStatus = 'PENDING_REVIEW';
  mockRefreshDriverMe.mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValue({ driver: { status: 'PENDING_REVIEW' }, nextStep: 'WAITING_APPROVAL' });
  await renderScreen();
  expect(JSON.stringify(tree.toJSON())).toContain('Network unavailable');
  await act(async () => button('Refresh status').props.onPress());
  expect(mockRefreshDriverMe).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Network unavailable');
});


it('lists only rejected personal documents and opens personal corrections', async () => {
  getDriverDocumentsStatus.mockResolvedValue({
    uploadedDocuments: [
      { id: 'id-1', type: 'ID_FRONT', status: 'REJECTED', rejectionReason: 'ID is blurry.' },
      { id: 'selfie-1', type: 'PERSONAL_SELFIE', status: 'APPROVED', rejectionReason: null },
    ],
  });
  await renderScreen();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('ID or residency front photo');
  expect(rendered).toContain('ID is blurry.');
  expect(rendered).not.toContain('Personal selfie');
  await act(async () => button('Fix submission').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-documents');
});

it('opens vehicle corrections directly when only a vehicle file was rejected', async () => {
  getDriverDocumentsStatus.mockResolvedValue({ uploadedDocuments: [] });
  getDriverVehicles.mockResolvedValue([{
    id: 'vehicle-1', status: 'REJECTED', rejectionReason: 'Rear image is blurry.',
    documents: [
      { id: 'rear-1', type: 'VEHICLE_REAR_PHOTO', status: 'REJECTED', rejectionReason: 'Rear image is blurry.', createdAt: '2026-02-01' },
      { id: 'front-1', type: 'VEHICLE_FRONT_PHOTO', status: 'APPROVED', rejectionReason: null, createdAt: '2026-02-01' },
    ],
  }]);
  await renderScreen();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Rear photo');
  expect(rendered).not.toContain('Front photo');
  await act(async () => button('Fix submission').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-information?flow=onboarding');
});
