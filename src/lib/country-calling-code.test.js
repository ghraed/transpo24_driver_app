import { callingCodeForCountry } from './country-calling-code';

it.each([
  ['FR', '+33'],
  ['LB', '+961'],
  ['AE', '+971'],
  ['US', '+1'],
  ['GB', '+44'],
  ['GG', '+44'],
  ['AX', '+358'],
  ['XK', '+383'],
])('uses the country calling code for %s', (country, expected) => {
  expect(callingCodeForCountry(country)).toBe(expected);
});

it('normalizes country codes and leaves unknown countries without a default', () => {
  expect(callingCodeForCountry(' fr ')).toBe('+33');
  expect(callingCodeForCountry('ZZ')).toBe('');
  expect(callingCodeForCountry()).toBe('');
});
