// Decoder for the Google encoded-polyline format, in which ORS returns the geometry of an
// optimised route (VROOM `options.g`).

/** Reads one zig-zag varint starting at `index`; returns the value and the next index. */
function readValue(encoded: string, index: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let byte: number;
  let i = index;
  do {
    if (i >= encoded.length) {
      throw new Error(`truncated polyline at character ${i} of ${encoded.length}`);
    }
    byte = encoded.charCodeAt(i++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, next: i };
}

/**
 * Decodes an encoded polyline into GeoJSON-style [lng, lat] pairs.
 * @example decodePolyline('_p~iF~ps|U_ulLnnqC') // [[-120.2, 38.5], [-120.95, 40.7]]
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const coords: [number, number][] = [];
  let [lat, lng, index] = [0, 0, 0];
  while (index < encoded.length) {
    const dLat = readValue(encoded, index);
    const dLng = readValue(encoded, dLat.next);
    [lat, lng, index] = [lat + dLat.value, lng + dLng.value, dLng.next];
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}
