import {
  getMissingRequiredVehicleUploads,
  hasCompleteVehicleDocuments,
} from './vehicle-document-requirements';

const selectedFile = { uri: 'file://selected.jpg', mimeType: 'image/jpeg' };

it('lists every missing photo and document for a new onboarding vehicle', () => {
  const missing = getMissingRequiredVehicleUploads(null, {});
  expect(missing.map(item => item.field)).toEqual([
    'frontPhoto',
    'rearPhoto',
    'sidePhoto',
    'licensePlatePhoto',
    'registrationFrontDocument',
    'registrationBackDocument',
    'insuranceDocument',
  ]);
});

it('accepts selected files and existing non-rejected documents', () => {
  const vehicle = {
    status: 'PENDING_REVIEW',
    documents: [
      { type: 'VEHICLE_FRONT_PHOTO', status: 'UPLOADED' },
      { type: 'VEHICLE_REAR_PHOTO', status: 'APPROVED' },
    ],
  };
  const missing = getMissingRequiredVehicleUploads(vehicle, {
    sidePhoto: selectedFile,
    licensePlatePhoto: selectedFile,
    registrationFrontDocument: selectedFile,
    registrationBackDocument: selectedFile,
  });
  expect(missing.map(item => item.field)).toEqual(['insuranceDocument']);
  expect(hasCompleteVehicleDocuments(vehicle)).toBe(false);
});

it('requires replacement of rejected files even when their old URLs exist', () => {
  const vehicle = {
    status: 'REJECTED',
    frontPhotoUrl: 'https://example.com/old-front.jpg',
    documents: [
      { type: 'VEHICLE_FRONT_PHOTO', status: 'REJECTED' },
      { type: 'VEHICLE_REAR_PHOTO', status: 'APPROVED' },
    ],
  };
  const missing = getMissingRequiredVehicleUploads(vehicle, { frontPhoto: selectedFile });
  expect(missing.map(item => item.field)).not.toContain('frontPhoto');
  expect(missing.map(item => item.field)).not.toContain('rearPhoto');
  expect(missing.map(item => item.field)).toContain('insuranceDocument');
  expect(missing).toHaveLength(5);
});

it('recognizes a complete persisted document set using the same rule as submission', () => {
  const types = [
    'VEHICLE_FRONT_PHOTO',
    'VEHICLE_REAR_PHOTO',
    'VEHICLE_SIDE_PHOTO',
    'VEHICLE_LICENSE_PLATE_PHOTO',
    'VEHICLE_REGISTRATION_FRONT',
    'VEHICLE_REGISTRATION_BACK',
    'VEHICLE_INSURANCE_DOCUMENT',
  ];
  const vehicle = { documents: types.map(type => ({ type, status: 'UPLOADED' })) };
  expect(getMissingRequiredVehicleUploads(vehicle, {})).toEqual([]);
  expect(hasCompleteVehicleDocuments(vehicle)).toBe(true);
});
