import React from 'react';
import { act, create } from 'react-test-renderer';

import CheckDetailsScreen from '../src/app/check-details';
import { getDriverDocumentsStatus, getDriverVehicle, submitDriverDocumentsForReview } from '@/lib/api';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
const mockT = key => key;
const mockRefreshDriverMe = jest.fn();
const mockVehicleId = 'selected';
const documentTypes = [
  'VEHICLE_FRONT_PHOTO', 'VEHICLE_REAR_PHOTO', 'VEHICLE_SIDE_PHOTO',
  'VEHICLE_LICENSE_PLATE_PHOTO', 'VEHICLE_REGISTRATION_FRONT',
  'VEHICLE_REGISTRATION_BACK', 'VEHICLE_INSURANCE_DOCUMENT',
];
const profile = {
  firstName: 'Sam', lastName: 'Driver', phone: '+96170123456',
  preferredLanguages: ['fr'], isProfileCompleted: true,
};
const vehicle = {
  id: mockVehicleId, brand: 'Ford', model: 'Transit', year: 2024,
  vehicleType: 'VAN', status: 'PENDING_REVIEW', licensePlateNumber: 'ABC123',
  condition: 'GOOD', capacityKg: 1200, lengthCm: 250, widthCm: 180, heightCm: 170,
  allowedCargoTypes: ['GOODS'],
  documents: documentTypes.map(type => ({ type, status: 'UPLOADED', createdAt: '2026-09-29' })),
};
const readyStatus = {
  onboardingStatus: 'PENDING_DOCUMENTS', reviewVehicleId: null,
  missingDocuments: [], missingDocumentLabels: [], canSubmitForReview: true,
  uploadedDocuments: [],
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ vehicleId: mockVehicleId }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({ refreshDriverMe: mockRefreshDriverMe }),
}));
jest.mock('@/lib/api', () => ({
  getDriverDocumentsStatus: jest.fn(), getDriverVehicle: jest.fn(),
  submitDriverDocumentsForReview: jest.fn(),
}));
jest.mock('@/lib/auth-storage', () => ({
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearLoadCapacityDraft: jest.fn().mockResolvedValue(undefined),
  clearOnboardingDocumentsStatus: jest.fn().mockResolvedValue(undefined),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshDriverMe.mockResolvedValue({ driver: profile });
  getDriverVehicle.mockResolvedValue(vehicle);
  getDriverDocumentsStatus.mockResolvedValue(readyStatus);
  submitDriverDocumentsForReview.mockResolvedValue({ ...readyStatus, onboardingStatus: 'PENDING_REVIEW', reviewVehicleId: mockVehicleId });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});
const renderScreen = async () => {
  await act(async () => { tree = create(<CheckDetailsScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};
const submitButton = () => tree.root.findAll(node => node.props.accessibilityRole === 'button'
  && node.findAllByType && node.findAllByType('Text').some(child => child.props.children === 'Submit for Review'))[0];

it('shows the saved details and links to each section before submitting the selected vehicle', async () => {
  await renderScreen();
  const content = JSON.stringify(tree.toJSON());
  expect(content).toContain('Sam Driver');
  expect(content).toContain('ABC123');
  expect(content).toContain('1200 kg');
  expect(tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel?.startsWith('Change '))).toHaveLength(4);
  await act(async () => submitButton().props.onPress());
  expect(submitDriverDocumentsForReview).toHaveBeenCalledWith(mockVehicleId);
  expect(mockRouter.replace).toHaveBeenCalledWith('/waiting-approval');
});

it('checks status when the submission response is lost and does not ask for a duplicate review', async () => {
  getDriverDocumentsStatus.mockResolvedValueOnce(readyStatus).mockResolvedValueOnce({
    ...readyStatus, onboardingStatus: 'PENDING_REVIEW', reviewVehicleId: mockVehicleId,
  });
  submitDriverDocumentsForReview.mockRejectedValue(new Error('Network unavailable'));
  await renderScreen();
  await act(async () => submitButton().props.onPress());
  expect(getDriverDocumentsStatus).toHaveBeenCalledTimes(2);
  expect(submitDriverDocumentsForReview).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/waiting-approval');
});

it('keeps saved details on screen when submission fails before committing', async () => {
  submitDriverDocumentsForReview.mockRejectedValue(new Error('Server unavailable'));
  await renderScreen();
  await act(async () => submitButton().props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Server unavailable');
  expect(JSON.stringify(tree.toJSON())).toContain('ABC123');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
