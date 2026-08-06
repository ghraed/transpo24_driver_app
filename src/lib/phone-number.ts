export function normalizeDialingCode(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export function buildInternationalPhoneNumber(
  dialingCode: string,
  localNumber: string,
): string {
  const normalizedDialingCode = normalizeDialingCode(dialingCode);
  const trimmedLocalNumber = localNumber.trim();

  if (!trimmedLocalNumber) {
    return normalizedDialingCode;
  }

  if (trimmedLocalNumber.startsWith('+')) {
    return trimmedLocalNumber;
  }

  const normalizedLocalNumber = trimmedLocalNumber.replace(/^0+/, '');

  return `${normalizedDialingCode}${normalizedLocalNumber}`;
}

export function maskPhoneNumber(phoneNumber: string): string {
  return phoneNumber.length > 7
    ? `${phoneNumber.slice(0, 4)} •••• ${phoneNumber.slice(-3)}`
    : phoneNumber;
}
