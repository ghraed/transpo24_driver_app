type RouteCoordinate = { latitude: number; longitude: number };

export function decodePolyline(encoded: string): RouteCoordinate[] {
  const coordinates: RouteCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      if (index >= encoded.length || shift > 30) return [];
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return [];
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      if (index >= encoded.length || shift > 30) return [];
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return [];
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    if (Math.abs(latitude / 1e5) > 90 || Math.abs(longitude / 1e5) > 180) return [];
    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
}

