import type { Geometry } from 'geojson'

/** Haversine-Distanz in Metern (EPSG:4326). */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function ringCentroid(ring: [number, number][]): { lat: number; lng: number } {
  let sx = 0
  let sy = 0
  let n = 0
  const last = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length
  for (let i = 0; i < last; i++) {
    const [lng, lat] = ring[i]
    if (typeof lat === 'number' && typeof lng === 'number') {
      sx += lat
      sy += lng
      n++
    }
  }
  if (n === 0) return { lat: 0, lng: 0 }
  return { lat: sx / n, lng: sy / n }
}

/** Einfacher Schwerpunkt des äußeren Rings (Polygon / MultiPolygon). */
export function geoJsonPolygonCentroid(geometry: Geometry | null | undefined): { lat: number; lng: number } | null {
  if (!geometry) return null
  if (geometry.type === 'Polygon' && geometry.coordinates?.[0]?.length) {
    return ringCentroid(geometry.coordinates[0] as [number, number][])
  }
  if (geometry.type === 'MultiPolygon' && geometry.coordinates?.length) {
    const first = geometry.coordinates[0]?.[0]
    if (first?.length) return ringCentroid(first as [number, number][])
  }
  return null
}
