export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function getResendSecondsRemaining(
  deadline: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
