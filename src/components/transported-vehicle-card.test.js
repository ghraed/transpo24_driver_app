import React from 'react';
import { act, create } from 'react-test-renderer';
import { TransportedVehicleCard } from './transported-vehicle-card';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => require('@/localization/locales/en.json')[key] || options?.defaultValue || key,
    i18n: { language: 'en' },
  }),
}));

const vehicle = {
  vin: 'WVWZZZ1JZXW000001',
  brand: 'Volkswagen',
  model: 'Golf',
  series: 'Mk7',
  variant: 'GTI',
  manufactureYear: 2019,
  estimatedWeightKg: 1400,
  bodyType: 'HATCHBACK',
  transmission: 'AUTOMATIC',
  mobility: 'ROLLABLE',
  condition: 'Used',
  issues: ['DEAD_BATTERY'],
  conditionNotes: 'Needs a jump start',
};

test('shows each transported vehicle value with a localized field label', async () => {
  let tree;
  await act(async () => { tree = create(<TransportedVehicleCard vehicle={vehicle} />); });
  const output = JSON.stringify(tree.toJSON());
  for (const label of ['Brand', 'Model', 'Year', 'VIN', 'Series', 'Variant', 'Estimated weight', 'Body type', 'Transmission', 'Mobility', 'Condition', 'Issues', 'Condition notes']) {
    expect(output).toContain(label);
  }
  for (const value of ['Volkswagen', 'Golf', 'Mk7', 'GTI', 'Hatchback', 'Automatic', 'Not drivable, but can roll', 'Dead battery', 'Needs a jump start']) {
    expect(output).toContain(value);
  }
});
