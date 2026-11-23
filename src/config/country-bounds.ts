import countryBoxes from './country-bounding-boxes.json';
import extraCountryBoxes from './country-bounding-boxes-extra.json';

type Coordinate = { latitude: number; longitude: number };
export type CountryBounds = { northeast: Coordinate; southwest: Coordinate };

// Public-domain main-territory bounds, supplemented with missing ISO countries
// from public-domain TopoJSON. The local data avoids a network dependency.
// Sources: https://github.com/sandstrom/country-bounding-boxes
//          https://github.com/rembish/iso-topojson
export function getCountryBounds(countryCode: string | null): CountryBounds | null {
  if (!countryCode) return null;
  const main = (countryBoxes as unknown as Record<string, [string, [number, number, number, number]]>)[countryCode];
  const extra = (extraCountryBoxes as unknown as Record<string, [number, number, number, number]>)[countryCode];
  const box = main?.[1] ?? extra;
  if (!box) return null;
  const [west, south, east, north] = box;
  const latitude = (south + north) / 2;
  const longitude = (west + east) / 2;
  const adjustedLatitude = north - south < 0.02;
  const adjustedLongitude = east - west < 0.02;
  return {
    southwest: { latitude: adjustedLatitude ? latitude - 0.01 : south, longitude: adjustedLongitude ? longitude - 0.01 : west },
    northeast: { latitude: adjustedLatitude ? latitude + 0.01 : north, longitude: adjustedLongitude ? longitude + 0.01 : east },
  };
}
