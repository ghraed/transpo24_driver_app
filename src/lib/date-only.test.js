import { formatDateOnly, parseDateOnly } from './date-only';

test.each(['1965-02-12', '1990-11-25', '2000-02-29', '2027-08-20'])('round trips %s as a local calendar day', value => {
  const parsed = parseDateOnly(value);
  expect(parsed.getHours()).toBe(0);
  expect(formatDateOnly(parsed)).toBe(value);
});

test('formats local calendar components without shifting to UTC', () => {
  // UTC would be the previous day in a timezone east of Greenwich.
  const date = new Date(2027, 7, 20);
  expect(formatDateOnly(date)).toBe('2027-08-20');
});

test.each(['', 'invalid', '2026-02-30', '2026-13-01'])('invalid date %s opens at the fallback', value => {
  const fallback = new Date(2008, 7, 20);
  expect(parseDateOnly(value, fallback)).toEqual(fallback);
});
