import type {
  CreateDriverVehicleForm,
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

function hasUsableDocument(vehicle: DriverVehicle | null, type: DriverDocumentType): boolean {
  return vehicle?.documents?.some(
    (document) => document.type === type && document.status !== 'REJECTED',
  ) ?? false;
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
