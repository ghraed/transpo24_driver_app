import i18n from '@/localization/i18n';
import type { RequestStatus } from '@/types/auth';

const REQUEST_STATUS_KEYS: Partial<Record<RequestStatus, string>> = {
  PENDING_QUOTES: 'Waiting for offers',
  QUOTED: 'Quoted',
  ACCEPTED: 'Accepted',
  DRIVER_ASSIGNED: 'Driver selected',
  DRIVER_GOING_TO_PICKUP: 'En route to pickup',
  DRIVER_ARRIVED_PICKUP: 'Arrived at pickup',
  ITEM_PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DRIVER_GOING_TO_DROPOFF: 'En route to delivery',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function getRequestStatusLabel(status: RequestStatus | string | null | undefined): string {
  if (!status) {
    return i18n.t('Unknown status');
  }

  const key = REQUEST_STATUS_KEYS[status as RequestStatus];
  if (key) {
    return i18n.t(key);
  }

  return status;
}
