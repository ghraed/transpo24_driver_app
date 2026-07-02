import type {
  DayOfWeek,
  DriverCargoType,
  DriverVehicleLoadFormDay,
  VehicleType,
  WorkingAvailabilityItem,
} from '@/types/auth';

export const DRIVER_LOAD_DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

export const DRIVER_LOAD_ORDERED_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export const DRIVER_CARGO_TYPE_OPTIONS: Array<{
  label: string;
  value: DriverCargoType;
}> = [
  { label: 'Vehicle transport', value: 'VEHICLE' },
  { label: 'Motorcycle transport', value: 'MOTORCYCLE' },
  { label: 'Goods', value: 'GOODS' },
  { label: 'Furniture', value: 'FURNITURE' },
  { label: 'General cargo', value: 'OTHER' },
];

export function isCarCarrierVehicleType(vehicleType?: VehicleType | null): boolean {
  return vehicleType === 'OPEN_CAR_CARRIER' || vehicleType === 'ENCLOSED_CARRIER';
}

export function createDefaultLoadWorkingSchedule(): DriverVehicleLoadFormDay[] {
  return DRIVER_LOAD_ORDERED_DAYS.map((dayOfWeek) => {
    const isWeekday = dayOfWeek !== 'SATURDAY' && dayOfWeek !== 'SUNDAY';
    return {
      dayOfWeek,
      label: DRIVER_LOAD_DAY_LABELS[dayOfWeek],
      isAvailable: isWeekday,
      startTime: isWeekday ? '08:00' : '',
      endTime: isWeekday ? '18:00' : '',
    };
  });
}

export function mapWorkingAvailabilityToForm(
  schedule?: WorkingAvailabilityItem[] | null,
): DriverVehicleLoadFormDay[] {
  if (!schedule?.length) {
    return createDefaultLoadWorkingSchedule();
  }

  return DRIVER_LOAD_ORDERED_DAYS.map((dayOfWeek) => {
    const found = schedule.find((entry) => entry.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      label: DRIVER_LOAD_DAY_LABELS[dayOfWeek],
      isAvailable: found?.isAvailable ?? false,
      startTime: found?.timeRanges[0]?.startTime ?? '',
      endTime: found?.timeRanges[0]?.endTime ?? '',
    };
  });
}
