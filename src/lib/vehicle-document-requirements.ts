import type {
  CreateDriverVehicleForm,
  DriverDocument,
  DriverDocumentType,
  DriverVehicle,
} from '@/types/auth';

export const REQUIRED_VEHICLE_UPLOADS = [
  { field: 'frontPhoto', type: 'VEHICLE_FRONT_PHOTO', label: 'Front photo' },
  { field: 'rearPhoto', type: 'VEHICLE_REAR_PHOTO', label: 'Rear photo' },
  { field: 'sidePhoto', type: 'VEHICLE_SIDE_PHOTO', label: 'Side photo' },
  { field: 'licensePlatePhoto', type: 'VEHICLE_LICENSE_PLATE_PHOTO', label: 'License plate photo' },
  { field: 'registrationFrontDocument', type: 'VEHICLE_REGISTRATION_FRONT', label: 'Registration card front side' },
  { field: 'registrationBackDocument', type: 'VEHICLE_REGISTRATION_BACK', label: 'Registration card back side' },
  { field: 'insuranceDocument', type: 'VEHICLE_INSURANCE_DOCUMENT', label: 'Insurance document' },
] as const satisfies readonly {
  field: keyof CreateDriverVehicleForm;
  type: DriverDocumentType;
  label: string;
}[];

export function getLatestVehicleDocument(
  vehicle: DriverVehicle | null,
  type: DriverDocumentType,
): DriverDocument | undefined {
  return vehicle?.documents?.filter((document) => document.type === type)
    .reduce<DriverDocument | undefined>((latest, document) => {
      if (!latest || document.createdAt >= latest.createdAt) return document;
      return latest;
    }, undefined);
}

function hasUsableDocument(vehicle: DriverVehicle | null, type: DriverDocumentType): boolean {
  const document = getLatestVehicleDocument(vehicle, type);
  return Boolean(document && document.status !== 'REJECTED');
}

export function getMissingRequiredVehicleUploads(
  vehicle: DriverVehicle | null,
  form: CreateDriverVehicleForm,
): (typeof REQUIRED_VEHICLE_UPLOADS)[number][] {
  return REQUIRED_VEHICLE_UPLOADS.filter(
    ({ field, type }) => !form[field] && !hasUsableDocument(vehicle, type),
  );
}

export function hasCompleteVehicleDocuments(vehicle: DriverVehicle): boolean {
  return REQUIRED_VEHICLE_UPLOADS.every(({ type }) => hasUsableDocument(vehicle, type));
}
