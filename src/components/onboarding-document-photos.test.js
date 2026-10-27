import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import VehicleDocumentsScreen from '@/app/vehicle-documents';
import { pickDocumentPhoto, DocumentPhotoError } from '@/lib/document-photo';
import { getDriverDocumentsStatus, uploadDriverDocument } from '@/lib/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/document-photo', () => ({ pickDocumentPhoto: jest.fn(), DocumentPhotoError: class extends Error {} }));
jest.mock('@/lib/api', () => ({ getDriverDocumentsStatus: jest.fn(), uploadDriverDocument: jest.fn() }));
jest.mock('@/lib/auth-storage', () => ({
  clearOnboardingDocumentsDraft: jest.fn(), persistLastOnboardingRoute: jest.fn(),
  persistOnboardingDocumentsDraft: jest.fn(), persistOnboardingDocumentsStatus: jest.fn(),
  readOnboardingDocumentsDraft: jest.fn(async () => null), readOnboardingDocumentsStatus: jest.fn(async () => null),
}));
jest.mock('@/components/date-time-picker-dialog', () => ({ DateTimePickerDialog: () => null }));
const types = ['PERSONAL_SELFIE', 'ID_FRONT', 'ID_BACK', 'DRIVING_LICENSE'];
const status = { requiredDocuments: types, missingDocuments: types, missingDocumentLabels: [], uploadedDocuments: [], identityDocumentKind: 'NATIONAL_ID' };
const photo = { uri: 'file:///prepared.jpg', fileName: 'IMG_1234.jpg', mimeType: 'image/jpeg', fileSize: 1000000, width: 2560, height: 1920 };
let tree;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); getDriverDocumentsStatus.mockResolvedValue(status); uploadDriverDocument.mockResolvedValue(status); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = undefined; jest.useRealTimers(); });
async function render() {
  await act(async () => { tree = create(<VehicleDocumentsScreen />); });
  await act(async () => { jest.runOnlyPendingTimers(); });
}
function buttons(label) {
  return tree.root.findAllByType(Text).filter(node => node.props.children === label).map(node => {
    let button = node.parent;
    while (button && typeof button.props.onPress !== 'function') button = button.parent;
    return button;
  }).filter(Boolean);
}

describe.each([['camera', 'Take image'], ['library', 'Select']])('%s onboarding images', (source, label) => {
  test.each(types)('uploads only the prepared JPEG for %s', async type => {
    pickDocumentPhoto.mockResolvedValue(photo);
    await render();
    await act(async () => { buttons(label)[types.indexOf(type)].props.onPress(); });
    expect(pickDocumentPhoto).toHaveBeenCalledWith(source);
    expect(uploadDriverDocument).toHaveBeenCalledWith(expect.objectContaining({ documentType: type, file: photo }));
  });
});

test('blocks competing photo selection and Next while photo processing is pending', async () => {
  let resolve;
  pickDocumentPhoto.mockReturnValue(new Promise(done => { resolve = done; }));
  await render();
  await act(async () => { buttons('Take image')[0].props.onPress(); });
  expect(uploadDriverDocument).not.toHaveBeenCalled();
  expect(buttons('Next')[0].props.disabled).toBe(true);
  expect(buttons('Take image').every(node => node.props.disabled)).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Preparing photo…')).toBe(true);
  await act(async () => { resolve(photo); });
  expect(uploadDriverDocument).toHaveBeenCalledTimes(1);
});

test('preparation errors are visible and do not upload the oversized original', async () => {
  pickDocumentPhoto.mockRejectedValue(new DocumentPhotoError('Unable to prepare this photo. Please try another image.'));
  await render();
  await act(async () => { buttons('Take image')[0].props.onPress(); });
  expect(uploadDriverDocument).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Unable to prepare this photo. Please try another image.')).toBe(true);
  expect(buttons('Take image').every(node => !node.props.disabled)).toBe(true);
});

test('canceling selection restores the controls without uploading anything', async () => {
  pickDocumentPhoto.mockResolvedValue(null);
  await render();
  await act(async () => { buttons('Select')[0].props.onPress(); });
  expect(uploadDriverDocument).not.toHaveBeenCalled();
  expect(buttons('Take image').every(node => !node.props.disabled)).toBe(true);
});
