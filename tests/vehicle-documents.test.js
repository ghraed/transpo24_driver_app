import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import VehicleDocumentsScreen from '../src/app/vehicle-documents';
import { getDriverDocumentsStatus, updateDriverDocumentDates, uploadDriverDocument } from '@/lib/api';
import { readOnboardingDocumentsDraft } from '@/lib/auth-storage';

const mockRouter = { replace: jest.fn() };
const mockStatus = {
  identityDocumentKind: null,
  requiredDocuments: ['PERSONAL_SELFIE', 'ID_FRONT', 'ID_BACK', 'DRIVING_LICENSE'],
  uploadedDocuments: [],
  missingDocuments: ['PERSONAL_SELFIE', 'ID_FRONT', 'ID_BACK', 'DRIVING_LICENSE'],
  missingDocumentLabels: [],
  canSubmitForReview: false,
};

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/lib/driver-upload-image', () => ({
  DRIVER_IMAGE_GUIDANCE: 'JPEG, PNG, or WEBP images, up to 5 MB. Large photos are resized automatically.',
  MAX_DRIVER_IMAGE_BYTES: 5 * 1024 * 1024,
  prepareDriverUploadImage: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  getDriverDocumentsStatus: jest.fn(), updateDriverDocumentDates: jest.fn(), uploadDriverDocument: jest.fn(),
}));
jest.mock('@/lib/auth-storage', () => ({
  readOnboardingDocumentsDraft: jest.fn().mockResolvedValue(null),
  readOnboardingDocumentsStatus: jest.fn().mockResolvedValue(null),
  persistOnboardingDocumentsDraft: jest.fn().mockResolvedValue(undefined),
  persistOnboardingDocumentsStatus: jest.fn().mockResolvedValue(undefined),
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearOnboardingDocumentsDraft: jest.fn().mockResolvedValue(undefined),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  getDriverDocumentsStatus.mockResolvedValue(mockStatus);
  readOnboardingDocumentsDraft.mockResolvedValue(null);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

async function renderScreen() {
  await act(async () => { tree = create(<VehicleDocumentsScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

it('leaves expiry dates empty until the driver selects one and guards residency upload', async () => {
  await renderScreen();
  expect(JSON.stringify(tree.toJSON())).toContain('Select driving license expiry date');
  let residency = tree.root.findAllByType(Text).find(node => node.props.children === 'Residency card');
  while (residency && typeof residency.props.onPress !== 'function') residency = residency.parent;
  expect(residency).toBeDefined();
  await act(async () => residency.props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Select residency expiry date');
  const pickFront = tree.root.findAll(node =>
    node.props.accessibilityLabel === 'Select ID or residency card front *' && typeof node.props.onPress === 'function')[0];
  await act(async () => pickFront.props.onPress());
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(uploadDriverDocument).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Residency expiry date is required.');
});

it('restores only the expiry date actually saved with an uploaded document', async () => {
  getDriverDocumentsStatus.mockResolvedValue({
    ...mockStatus,
    identityDocumentKind: 'RESIDENCY_CARD',
    uploadedDocuments: [{ type: 'ID_FRONT', status: 'UPLOADED', expiresAt: '2028-06-15T00:00:00.000Z' }],
  });
  await renderScreen();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('2028-06-15');
  expect(rendered).toContain('Select driving license expiry date');
});

it('requires uploaded identity images to be replaced after changing document type', async () => {
  getDriverDocumentsStatus.mockResolvedValue({
    ...mockStatus,
    identityDocumentKind: 'NATIONAL_ID',
    missingDocuments: [],
    canSubmitForReview: true,
    uploadedDocuments: mockStatus.requiredDocuments.map(type => ({ type, status: 'UPLOADED' })),
  });
  await renderScreen();
  let residency = tree.root.findAllByType(Text).find(node => node.props.children === 'Residency card');
  while (residency && typeof residency.props.onPress !== 'function') residency = residency.parent;
  await act(async () => residency.props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Re-upload affected documents after changing their details.');
  let next = tree.root.findAllByType(Text).find(node => node.props.children === 'Next');
  while (next && next.props.disabled === undefined) next = next.parent;
  expect(next.props.disabled).toBe(true);
});


it('discards expiry dates from legacy drafts that may have been auto-filled', async () => {
  readOnboardingDocumentsDraft.mockResolvedValue(JSON.stringify({
    idDocumentKind: 'RESIDENCY_CARD',
    idExpiryDate: '2027-09-29',
    drivingLicenseExpiryDate: '2027-09-29',
  }));
  await renderScreen();
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Select residency expiry date');
  expect(rendered).toContain('Select driving license expiry date');
  expect(rendered).not.toContain('2027-09-29');
});

const uploadedStatus = {
  ...mockStatus,
  identityDocumentKind: 'NATIONAL_ID',
  missingDocuments: [],
  canSubmitForReview: true,
  uploadedDocuments: mockStatus.requiredDocuments.map(type => ({
    type, status: 'UPLOADED', expiresAt: null,
  })),
};

function nextButton() {
  let next = tree.root.findAllByType(Text).find(node => node.props.children === 'Next');
  while (next && next.props.disabled === undefined) next = next.parent;
  return next;
}

it('lets a driver set the licence expiry after uploading images and continue without re-uploading', async () => {
  getDriverDocumentsStatus.mockResolvedValue(uploadedStatus);
  updateDriverDocumentDates.mockResolvedValue({
    ...uploadedStatus,
    uploadedDocuments: uploadedStatus.uploadedDocuments.map(document =>
      document.type === 'DRIVING_LICENSE'
        ? { ...document, expiresAt: '2030-01-01T00:00:00.000Z' }
        : document,
    ),
  });
  await renderScreen();
  let dateField = tree.root.findAllByType(Text).find(node => node.props.children === 'Select driving license expiry date');
  while (dateField && typeof dateField.props.onPress !== 'function') dateField = dateField.parent;
  await act(async () => dateField.props.onPress());
  const picker = tree.root.findAll(node => node.props.mode === 'date' && typeof node.props.onChange === 'function')[0];
  await act(async () => picker.props.onChange({ type: 'set' }, new Date(2030, 0, 1)));

  expect(JSON.stringify(tree.toJSON())).not.toContain('Re-upload affected documents after changing their details.');
  expect(nextButton().props.disabled).toBe(false);
  await act(async () => nextButton().props.onPress());
  expect(updateDriverDocumentDates).toHaveBeenCalledWith({ drivingLicenseExpiryDate: '2030-01-01' });
  expect(uploadDriverDocument).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-information?flow=onboarding');
});

it('recovers a saved draft stuck on the old licence re-upload requirement', async () => {
  getDriverDocumentsStatus.mockResolvedValue(uploadedStatus);
  readOnboardingDocumentsDraft.mockResolvedValue(JSON.stringify({
    dateDraftVersion: 2,
    idDocumentKind: 'NATIONAL_ID',
    drivingLicenseExpiryDate: '2030-01-01',
    replacementDocumentTypes: ['DRIVING_LICENSE'],
  }));
  await renderScreen();
  expect(nextButton().props.disabled).toBe(false);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Re-upload affected documents after changing their details.');
});

it('saves a changed residency expiry for both uploaded ID images on Next', async () => {
  const residencyStatus = { ...uploadedStatus, identityDocumentKind: 'RESIDENCY_CARD' };
  getDriverDocumentsStatus.mockResolvedValue(residencyStatus);
  readOnboardingDocumentsDraft.mockResolvedValue(JSON.stringify({
    dateDraftVersion: 2,
    idDocumentKind: 'RESIDENCY_CARD',
    idExpiryDate: '2030-01-01',
    replacementDocumentTypes: [],
  }));
  updateDriverDocumentDates.mockResolvedValue(residencyStatus);
  await renderScreen();
  expect(nextButton().props.disabled).toBe(false);
  await act(async () => nextButton().props.onPress());
  expect(updateDriverDocumentDates).toHaveBeenCalledWith({ idExpiryDate: '2030-01-01' });
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-information?flow=onboarding');
});

it('keeps the driver on the document screen when saving an expiry date fails', async () => {
  getDriverDocumentsStatus.mockResolvedValue(uploadedStatus);
  readOnboardingDocumentsDraft.mockResolvedValue(JSON.stringify({
    dateDraftVersion: 2,
    idDocumentKind: 'NATIONAL_ID',
    drivingLicenseExpiryDate: '2030-01-01',
    replacementDocumentTypes: ['DRIVING_LICENSE'],
  }));
  updateDriverDocumentDates.mockRejectedValue(new Error('Connection lost'));
  await renderScreen();
  await act(async () => nextButton().props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Connection lost');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
