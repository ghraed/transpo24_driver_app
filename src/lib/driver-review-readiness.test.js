import { getReviewReadiness, isReviewSubmittedForVehicle } from './driver-review-readiness';

const documentTypes = [
  'VEHICLE_FRONT_PHOTO', 'VEHICLE_REAR_PHOTO', 'VEHICLE_SIDE_PHOTO',
  'VEHICLE_LICENSE_PLATE_PHOTO', 'VEHICLE_REGISTRATION_FRONT',
  'VEHICLE_REGISTRATION_BACK', 'VEHICLE_INSURANCE_DOCUMENT',
];
const vehicle = {
  id: 'selected', vehicleType: 'VAN', status: 'PENDING_REVIEW',
  capacityKg: 1000, lengthCm: 300, widthCm: 200, heightCm: 180,
  allowedCargoTypes: ['GOODS'],
  documents: documentTypes.map(type => ({ type, status: 'UPLOADED', createdAt: '2026-09-29' })),
};
const profile = { isProfileCompleted: true };
const documents = { missingDocuments: [], canSubmitForReview: true };

it('requires complete documents and capacity on the selected vehicle', () => {
  expect(Object.values(getReviewReadiness(profile, documents, vehicle)).every(Boolean)).toBe(true);
  const incomplete = { ...vehicle, id: 'other', capacityKg: null };
  expect(getReviewReadiness(profile, documents, incomplete).capacity).toBe(false);
  expect(getReviewReadiness(profile, documents, {
    ...vehicle, documents: vehicle.documents.slice(1),
  }).vehicle).toBe(false);
  expect(getReviewReadiness(profile, documents, {
    ...vehicle, status: 'REJECTED',
  }).vehicle).toBe(false);
  expect(getReviewReadiness(profile, documents, {
    ...vehicle, completeness: { hasBasicInfo: false, hasLoadCapacityProfile: true },
  }).vehicle).toBe(false);
});

it('recognizes a committed review only for its submitted vehicle', () => {
  const pending = { onboardingStatus: 'PENDING_REVIEW', reviewVehicleId: 'selected' };
  expect(isReviewSubmittedForVehicle(pending, 'selected')).toBe(true);
  expect(isReviewSubmittedForVehicle(pending, 'other')).toBe(false);
  expect(isReviewSubmittedForVehicle({ ...pending, onboardingStatus: 'REJECTED' }, 'selected')).toBe(false);
});
