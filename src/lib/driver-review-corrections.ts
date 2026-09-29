import { REQUIRED_VEHICLE_UPLOADS, getLatestVehicleDocument } from '@/lib/vehicle-document-requirements';
import type { DriverDocumentType, DriverDocumentsStatusResponse, DriverVehicle } from '@/types/auth';

const PERSONAL_DOCUMENT_LABELS: Partial<Record<DriverDocumentType, string>> = {
  PERSONAL_SELFIE: 'Personal selfie',
  ID_FRONT: 'ID or residency front photo',
  ID_BACK: 'ID or residency back photo',
  DRIVING_LICENSE: 'Driving license photo',
};

export type ReviewCorrectionItem = {
  key: string;
  label: string;
  reason: string;
  area: 'personal' | 'vehicle';
};

export function getRejectedReviewItems(
  documentsStatus: DriverDocumentsStatusResponse | null,
  vehicles: DriverVehicle[],
): ReviewCorrectionItem[] {
  const personal = (documentsStatus?.uploadedDocuments ?? [])
    .filter((document) => document.status === 'REJECTED')
    .map((document, index) => ({
      key: document.id || document.type || String(index),
      label: PERSONAL_DOCUMENT_LABELS[document.type] ?? document.type,
      reason: document.rejectionReason?.trim() ?? '',
      area: 'personal' as const,
    }));
  const vehicle = vehicles.flatMap((item) => REQUIRED_VEHICLE_UPLOADS.flatMap(({ type, label }) => {
    const document = getLatestVehicleDocument(item, type);
    return document?.status === 'REJECTED'
      ? [{
          key: document.id || item.id + ':' + type,
          label,
          reason: document.rejectionReason?.trim() ?? item.rejectionReason?.trim() ?? '',
          area: 'vehicle' as const,
        }]
      : [];
  }));
  return [...personal, ...vehicle];
}
