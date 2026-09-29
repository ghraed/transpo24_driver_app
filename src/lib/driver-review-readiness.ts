import type { DriverDocumentsStatusResponse, DriverProfile, DriverVehicle } from '@/types/auth';
import { hasCompleteVehicleDocuments } from '@/lib/vehicle-document-requirements';
import { isCarCarrierVehicleType } from '@/lib/vehicle-load-capacity';

export function hasCompleteLoadCapacityProfile(vehicle: DriverVehicle): boolean {
  if (!vehicle.allowedCargoTypes?.length) return false;
  if (isCarCarrierVehicleType(vehicle.vehicleType)) return true;
  return Boolean(
    vehicle.capacityKg && vehicle.capacityKg > 0 &&
    vehicle.lengthCm && vehicle.lengthCm > 0 &&
    vehicle.widthCm && vehicle.widthCm > 0 &&
    vehicle.heightCm && vehicle.heightCm > 0,
  );
}

export function getReviewReadiness(
  profile: DriverProfile,
  documents: DriverDocumentsStatusResponse,
  vehicle: DriverVehicle,
): { profile: boolean; documents: boolean; vehicle: boolean; capacity: boolean } {
  return {
    profile: profile.isProfileCompleted,
    documents: documents.missingDocuments.length === 0 && documents.canSubmitForReview,
    vehicle: (vehicle.status === 'PENDING_REVIEW' || vehicle.status === 'APPROVED') &&
      hasCompleteVehicleDocuments(vehicle) &&
      (vehicle.completeness?.hasBasicInfo ?? true),
    capacity: hasCompleteLoadCapacityProfile(vehicle) &&
      (vehicle.completeness?.hasLoadCapacityProfile ?? true),
  };
}

export function isReviewSubmittedForVehicle(
  status: DriverDocumentsStatusResponse,
  vehicleId: string,
): boolean {
  return status.onboardingStatus === 'PENDING_REVIEW' && status.reviewVehicleId === vehicleId;
}
