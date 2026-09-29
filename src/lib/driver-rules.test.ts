import { expect, test } from '@jest/globals';
import type { DriverNextStep } from '@/types/auth';
import { nextStepToRoute, resolveDriverEntryRoute, isOnboardingRoute } from './onboarding-route';
import { isActiveAcceptedJobStatus, isDeliveryPhaseRequestStatus, isTerminalRequestStatus } from './request-status';
import { parsePositiveNumber, createDefaultWorkingSchedule, ensureFullWorkingSchedule, formatDimensionsSummary, getCapacityStatusLabel, TIME_24H_REGEX } from './vehicle-load-capacity';
import { normalizeOtpCode, getResendSecondsRemaining } from './otp';
import { normalizeDialingCode, buildInternationalPhoneNumber, maskPhoneNumber } from './phone-number';
import { currencyForCountryCode, normalizeCountryCode } from './country-currency';

test.each([
  ['COMPLETE_PROFILE', '/complete-profile'],
  ['ADD_VEHICLE_DOCUMENTS', '/vehicle-documents'],
  ['UPLOAD_DOCUMENTS', '/vehicle-documents'],
  ['SET_AVAILABILITY', '/set-availability'],
  ['WAITING_APPROVAL', '/waiting-approval'],
  ['HOME', '/receive-requests'],
])('routes %s to %s', (step, route) => {
  expect(nextStepToRoute(step as DriverNextStep)).toBe(route);
});

test('saved onboarding routes are retained only when compatible with the next step', () => {
  expect(resolveDriverEntryRoute('UPLOAD_DOCUMENTS', '/load-capacity?vehicleId=7')).toBe('/load-capacity?vehicleId=7');
  expect(resolveDriverEntryRoute('SET_AVAILABILITY', '/vehicle-documents')).toBe('/set-availability');
  expect(resolveDriverEntryRoute('HOME', '/waiting-approval')).toBe('/receive-requests');
  expect(resolveDriverEntryRoute('UPLOAD_DOCUMENTS', '/unknown')).toBe('/vehicle-documents');
  expect(isOnboardingRoute('/vehicle-documents?vehicleId=7')).toBe(true);
  expect(isOnboardingRoute('/vehicle-documents-extra')).toBe(false);
});

test('request statuses classify delivery and terminal states', () => {
  for (const status of ['DELIVERED', 'COMPLETED', 'CANCELLED']) {
    expect(isTerminalRequestStatus(status)).toBe(true);
    expect(isActiveAcceptedJobStatus(status)).toBe(false);
  }
  for (const status of ['ITEM_PICKED_UP', 'IN_TRANSIT', 'DRIVER_GOING_TO_DROPOFF']) {
    expect(isDeliveryPhaseRequestStatus(status)).toBe(true);
    expect(isActiveAcceptedJobStatus(status)).toBe(true);
  }
  expect(isTerminalRequestStatus(null)).toBe(false);
  expect(isDeliveryPhaseRequestStatus(undefined)).toBe(false);
});

test('capacity numbers accept decimal commas and reject zero, negatives and nonfinite values', () => {
  expect(parsePositiveNumber(' 1,5 ')).toBe(1.5);
  for (const value of ['', '  ', '0', '-1', 'Infinity', 'abc']) expect(parsePositiveNumber(value)).toBeUndefined();
  expect(TIME_24H_REGEX.test('23:59')).toBe(true);
  expect(TIME_24H_REGEX.test('24:00')).toBe(false);
  expect(TIME_24H_REGEX.test('08:60')).toBe(false);
});

test('working schedule fills missing days without sharing mutable default ranges', () => {
  const schedule = createDefaultWorkingSchedule();
  expect(schedule).toHaveLength(7);
  expect(schedule.filter(day => day.isAvailable)).toHaveLength(5);
  const monday = { dayOfWeek: 'MONDAY' as const, isAvailable: false, timeRanges: [{ startTime: '09:00', endTime: '12:00' }] };
  const full = ensureFullWorkingSchedule([monday]);
  expect(full).toHaveLength(7);
  expect(full[0]).toEqual(monday);
  expect(full[0].timeRanges).not.toBe(monday.timeRanges);
  full[0].timeRanges[0].startTime = '10:00';
  expect(monday.timeRanges[0].startTime).toBe('09:00');
});

test('capacity summaries distinguish standard, incomplete and explicit dimensions', () => {
  expect(formatDimensionsSummary(true)).toBe('Standard dimensions');
  expect(formatDimensionsSummary(false, 1, null, 2)).toBe('Dimensions not defined');
  expect(formatDimensionsSummary(false, 1, 2, 3)).toBe('1 x 2 x 3 m');
  expect(getCapacityStatusLabel({} as never)).toBe('Not defined');
  expect(getCapacityStatusLabel({ loadProfileName: 'Cargo' } as never)).toBe('Defined');
});

test('OTP normalization and resend countdown respect six digits and whole seconds', () => {
  expect(normalizeOtpCode('12a 34-567')).toBe('123456');
  expect(normalizeOtpCode('')).toBe('');
  expect(getResendSecondsRemaining(1001, 1)).toBe(1);
  expect(getResendSecondsRemaining(1001, 2)).toBe(1);
  expect(getResendSecondsRemaining(1001, 1001)).toBe(0);
  expect(getResendSecondsRemaining(1001, 2000)).toBe(0);
});

test('international phone construction handles trunk zeros, existing international numbers and empty input', () => {
  expect(normalizeDialingCode(' +961 ')).toBe('+961');
  expect(normalizeDialingCode('abc')).toBe('');
  expect(buildInternationalPhoneNumber('+961', ' 03123456 ')).toBe('+9613123456');
  expect(buildInternationalPhoneNumber('+961', '+442012345678')).toBe('+442012345678');
  expect(buildInternationalPhoneNumber('+961', ' ')).toBe('+961');
  expect(maskPhoneNumber('+9613123456')).toBe('+961 •••• 456');
  expect(maskPhoneNumber('1234567')).toBe('1234567');
});

test('country currency lookup normalizes codes and uses USD fallback', () => {
  expect(normalizeCountryCode(' ch ')).toBe('CH');
  expect(normalizeCountryCode('')).toBeNull();
  expect(currencyForCountryCode(' ch ')).toBe('CHF');
  expect(currencyForCountryCode('de')).toBe('EUR');
  expect(currencyForCountryCode('AE')).toBe('AED');
  expect(currencyForCountryCode('LB')).toBe('USD');
  expect(currencyForCountryCode(null)).toBe('USD');
});
