/** Stabiler Speicher-Key pro angeklickter Fläche: OSM-ID + Fingerprint der Außenkontur (gegen Überschreiben bei MultiPolygon / building:part). */
export function segmentStorageKey(osmKey: string, geometry: GeoJSON.Geometry): string {
  const ring = outerRing(geometry)
  const normalized = ring.map(([lng, lat]) => `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`).join('|')
  let h = 2166136261
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const suffix = (h >>> 0).toString(16).padStart(8, '0')
  return `${osmKey}#${suffix}`
}

function outerRing(geometry: GeoJSON.Geometry): number[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates[0] ?? []
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] ?? []
  return []
}
