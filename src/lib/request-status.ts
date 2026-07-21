import type { RequestStatus } from '@/types/auth';

const TERMINAL_REQUEST_STATUSES: RequestStatus[] = ['DELIVERED', 'COMPLETED', 'CANCELLED'];
const DELIVERY_PHASE_REQUEST_STATUSES: RequestStatus[] = [
  'ITEM_PICKED_UP',
  'IN_TRANSIT',
  'DRIVER_GOING_TO_DROPOFF',
];

export function isTerminalRequestStatus(status: RequestStatus | string | null | undefined): boolean {
  return Boolean(status && TERMINAL_REQUEST_STATUSES.includes(status as RequestStatus));
}

export function isActiveAcceptedJobStatus(status: RequestStatus | string | null | undefined): boolean {
  return Boolean(status) && !isTerminalRequestStatus(status);
}

export function isDeliveryPhaseRequestStatus(
  status: RequestStatus | string | null | undefined,
): boolean {
  return Boolean(status && DELIVERY_PHASE_REQUEST_STATUSES.includes(status as RequestStatus));
}
