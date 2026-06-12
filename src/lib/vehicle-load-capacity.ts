import type {
  DayOfWeek,
  DriverVehicle,
  VehicleCargoType,
  VehicleLoadCapacity,
  VehicleType,
  WorkingDaySchedule,
} from '@/types/auth';

export const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

export const ORDERED_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  OPEN_CAR_CARRIER: 'Open car carrier / open flatbed',
  ENCLOSED_CARRIER: 'Enclosed carrier',
  SMALL_TRUCK: 'Small truck',
  MEDIUM_TRUCK: 'Medium truck',
  PICKUP: 'Pickup',
  VAN: 'Van',
  TOW_TRUCK: 'Tow truck',
  MOTORCYCLE: 'Motorcycle',
};

export const CARGO_TYPE_OPTIONS: Array<{
  label: string;
  value: VehicleCargoType;
}> = [
  { label: 'Vehicle transport', value: 'VEHICLE' },
  { label: 'Motorcycle transport', value: 'MOTORCYCLE' },
  { label: 'Goods', value: 'GOODS' },
  { label: 'Furniture', value: 'FURNITURE' },
  { label: 'Fragile goods', value: 'FRAGILE_GOODS' },
  { label: 'Refrigerated goods', value: 'REFRIGERATED_GOODS' },
  { label: 'Heavy equipment', value: 'HEAVY_EQUIPMENT' },
  { label: 'Other', value: 'OTHER' },
];

export function isCarCarrierVehicleType(vehicleType?: VehicleType | string | null): boolean {
  return vehicleType === 'OPEN_CAR_CARRIER' || vehicleType === 'ENCLOSED_CARRIER';
}

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function parsePositiveNumber(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function createDefaultWorkingSchedule(): WorkingDaySchedule[] {
  return ORDERED_DAYS.map((dayOfWeek) => {
    const isWeekday = dayOfWeek !== 'SATURDAY' && dayOfWeek !== 'SUNDAY';
    return {
      dayOfWeek,
      isAvailable: isWeekday,
      timeRanges: isWeekday ? [{ startTime: '08:00', endTime: '18:00' }] : [],
    };
  });
}

export function ensureFullWorkingSchedule(
  schedule?: WorkingDaySchedule[] | null,
): WorkingDaySchedule[] {
  const defaultByDay = new Map(
    createDefaultWorkingSchedule().map((day) => [day.dayOfWeek, day]),
  );

  for (const entry of schedule ?? []) {
    defaultByDay.set(entry.dayOfWeek, {
      dayOfWeek: entry.dayOfWeek,
      isAvailable: entry.isAvailable,
      timeRanges: entry.timeRanges.map((range) => ({
        startTime: range.startTime,
        endTime: range.endTime,
      })),
    });
  }

  return ORDERED_DAYS.map((day) => defaultByDay.get(day) ?? {
    dayOfWeek: day,
    isAvailable: false,
    timeRanges: [],
  });
}

export function formatCargoTypes(cargoTypes: VehicleCargoType[]): string {
  return cargoTypes
    .map((cargoType) => CARGO_TYPE_OPTIONS.find((option) => option.value === cargoType)?.label ?? cargoType)
    .join(', ');
}

export function formatDimensionsSummary(
  dimensionsAreStandard: boolean,
  cargoLengthM?: number | null,
  cargoWidthM?: number | null,
  cargoHeightM?: number | null,
): string {
  if (dimensionsAreStandard) {
    return 'Standard dimensions';
  }

  if (
    cargoLengthM === null ||
    cargoLengthM === undefined ||
    cargoWidthM === null ||
    cargoWidthM === undefined ||
    cargoHeightM === null ||
    cargoHeightM === undefined
  ) {
    return 'Dimensions not defined';
  }

  return `${cargoLengthM} x ${cargoWidthM} x ${cargoHeightM} m`;
}

export function getCapacityStatusLabel(
  vehicle: DriverVehicle,
  capacity?: VehicleLoadCapacity,
): string {
  const hasCapacity = Boolean(
    capacity ||
      vehicle.loadProfileName ||
      vehicle.capacityKg ||
      vehicle.dimensionsAreStandard ||
      (vehicle.allowedCargoTypes?.length ?? 0) > 0 ||
      (vehicle.workingSchedule?.length ?? 0) > 0,
  );

  return hasCapacity ? 'Defined' : 'Not defined';
}

export function getVehicleCapacityGuidance(vehicleType: VehicleType): {
  loadPlaceholder: string;
  lengthPlaceholder: string;
  widthPlaceholder: string;
  heightPlaceholder: string;
  usageLabel: string;
  note: string;
} {
  switch (vehicleType) {
    case 'OPEN_CAR_CARRIER':
    case 'ENCLOSED_CARRIER':
      return {
        loadPlaceholder: '2500',
        lengthPlaceholder: '',
        widthPlaceholder: '',
        heightPlaceholder: '',
        usageLabel: 'Vehicle transport',
        note: 'Standard dimensions. No dimensions required for car carriers.',
      };
    case 'PICKUP':
      return {
        loadPlaceholder: '900',
        lengthPlaceholder: '2',
        widthPlaceholder: '1.8',
        heightPlaceholder: '1.2',
        usageLabel: 'Small goods transport',
        note: 'Example: 900 kg and 2 x 1.8 x 1.2 meters.',
      };
    case 'VAN':
      return {
        loadPlaceholder: '1500',
        lengthPlaceholder: '3',
        widthPlaceholder: '1.8',
        heightPlaceholder: '1.8',
        usageLabel: 'Goods, motorcycles',
        note: 'Example: 1,500 kg and 3 x 1.8 x 1.8 meters.',
      };
    case 'SMALL_TRUCK':
      return {
        loadPlaceholder: '5000',
        lengthPlaceholder: '4.5',
        widthPlaceholder: '2',
        heightPlaceholder: '2.2',
        usageLabel: 'Furniture, medium goods',
        note: 'Example: 5,000 kg and 4.5 x 2 x 2.2 meters.',
      };
    case 'MEDIUM_TRUCK':
      return {
        loadPlaceholder: '12000',
        lengthPlaceholder: '7',
        widthPlaceholder: '2.4',
        heightPlaceholder: '2.6',
        usageLabel: 'Large goods',
        note: 'Example: 12,000 kg and 7 x 2.4 x 2.6 meters.',
      };
    default:
      return {
        loadPlaceholder: '500',
        lengthPlaceholder: '1.5',
        widthPlaceholder: '1',
        heightPlaceholder: '1',
        usageLabel: 'Custom transport',
        note: 'Enter the real cargo weight and cargo space dimensions.',
      };
  }
}
