import React from 'react';
import { act, create } from 'react-test-renderer';

import WaitingApprovalScreen from './waiting-approval';
import { getDriverDocumentsStatus, getDriverVehicles } from '@/lib/api';

const mockRouter = { replace: jest.fn() };
const mockRefreshDriverMe = jest.fn();
let mockDriverStatus = 'REJECTED';

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
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

it('does not offer corrections to a driver still under review', async () => {
  mockDriverStatus = 'PENDING_REVIEW';
  await renderScreen();
  expect(button('Fix submission')).toBeUndefined();
  expect(getDriverDocumentsStatus).not.toHaveBeenCalled();
  expect(getDriverVehicles).not.toHaveBeenCalled();
});

it('routes an approved driver to the next step after refreshing', async () => {
  mockRefreshDriverMe.mockResolvedValue({ driver: { status: 'APPROVED' }, nextStep: 'SET_AVAILABILITY' });
  await act(async () => { tree = create(<WaitingApprovalScreen />); });
  await act(async () => button('Refresh status').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/set-availability');
});
