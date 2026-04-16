import type { Polygon } from 'geojson'

/**
 * Land Berlin – Bounding-Box (WGS84), konsistent mit api/berlin_bounds.php und Overpass.
 */
export const BERLIN_LNG_MIN = 13.088
export const BERLIN_LNG_MAX = 13.762
export const BERLIN_LAT_MIN = 52.339
export const BERLIN_LAT_MAX = 52.676

/** Polygon für MapLibre-`within`-Filter (Koordinaten [lng, lat]). */
export const BERLIN_WITHIN_POLYGON: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [BERLIN_LNG_MIN, BERLIN_LAT_MIN],
      [BERLIN_LNG_MAX, BERLIN_LAT_MIN],
      [BERLIN_LNG_MAX, BERLIN_LAT_MAX],
      [BERLIN_LNG_MIN, BERLIN_LAT_MAX],
      [BERLIN_LNG_MIN, BERLIN_LAT_MIN],
    ],
  ],
}

export const BERLIN_MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [BERLIN_LNG_MIN - 0.02, BERLIN_LAT_MIN - 0.02],
  [BERLIN_LNG_MAX + 0.02, BERLIN_LAT_MAX + 0.02],
]

export function isLatLngInBerlin(lat: number, lng: number): boolean {
  return (
    lat >= BERLIN_LAT_MIN &&
    lat <= BERLIN_LAT_MAX &&
    lng >= BERLIN_LNG_MIN &&
    lng <= BERLIN_LNG_MAX
  )
}
