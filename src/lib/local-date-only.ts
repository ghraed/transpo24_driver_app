export function formatLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateOnlyForPicker(value: string, fallback = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatLocalDateOnly(date) === value ? date : fallback;
}
