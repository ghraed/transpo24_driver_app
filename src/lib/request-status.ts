import type { RequestStatus } from '@/types/auth';

const TERMINAL_REQUEST_STATUSES: RequestStatus[] = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

export function isTerminalRequestStatus(status: RequestStatus | string | null | undefined): boolean {
  return Boolean(status && TERMINAL_REQUEST_STATUSES.includes(status as RequestStatus));
}

export function isActiveAcceptedJobStatus(status: RequestStatus | string | null | undefined): boolean {
  return Boolean(status) && !isTerminalRequestStatus(status);
}
