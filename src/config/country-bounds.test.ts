import { expect, it } from '@jest/globals';
import main from './country-bounding-boxes.json';
import extra from './country-bounding-boxes-extra.json';
import { getCountryBounds } from './country-bounds';

it('provides usable bounds for all 249 ISO countries and Kosovo', () => {
  const codes = new Set([...Object.keys(main), ...Object.keys(extra)]);
  expect(codes.size).toBe(250);
  for (const code of codes) {
    const bounds = getCountryBounds(code);
    expect(bounds).not.toBeNull();
    expect(bounds!.northeast.latitude).toBeGreaterThan(bounds!.southwest.latitude);
    expect(bounds!.northeast.longitude).toBeGreaterThan(bounds!.southwest.longitude);
  }
  const lebanon = getCountryBounds('LB')!;
  expect(lebanon.southwest.latitude).toBeCloseTo(33.09);
  expect(lebanon.southwest.longitude).toBeCloseTo(35.13);
  expect(lebanon.northeast.latitude).toBeCloseTo(34.64);
  expect(lebanon.northeast.longitude).toBeCloseTo(36.61);
});
