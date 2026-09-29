import { dateOnlyForPicker, formatLocalDateOnly } from './local-date-only';

const originalTimezone = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Beirut'; });
afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

it('keeps the selected local calendar day when UTC is still on the previous day', () => {
  const selected = new Date(2028, 5, 15);
  expect(selected.toISOString().slice(0, 10)).toBe('2028-06-14');
  expect(formatLocalDateOnly(selected)).toBe('2028-06-15');
  expect(formatLocalDateOnly(dateOnlyForPicker('2028-06-15'))).toBe('2028-06-15');
});

it('does not turn an invalid date into a different calendar day', () => {
  const fallback = new Date(2028, 5, 15);
  expect(dateOnlyForPicker('2028-02-30', fallback)).toBe(fallback);
});
