import { readJsonResponse } from '@/lib/readJsonResponse'
import type { BuildingUse } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export type OsmSuggestionResponse = {
  buildingUse: BuildingUse
  confidence: 'high' | 'low'
  labelDe: string
  attribution: string
}

/** Erwartet `way-123` oder `rel-456` (rel = OSM relation). */
export function parseOsmElementId(buildingId: string): { type: 'way' | 'relation'; id: string } | null {
  const w = buildingId.match(/^way-(\d+)$/)
  if (w) return { type: 'way', id: w[1] }
  const r = buildingId.match(/^rel-(\d+)$/)
  if (r) return { type: 'relation', id: r[1] }
  return null
}

export async function fetchOsmBuildingSuggestion(buildingId: string): Promise<OsmSuggestionResponse | null> {
  const parsed = parseOsmElementId(buildingId)
  if (!parsed) return null
  const q = new URLSearchParams({ type: parsed.type, id: parsed.id })
  const res = await fetch(`${API_BASE}/osm-building-suggestion.php?${q}`)
  const data = await readJsonResponse<OsmSuggestionResponse & { error?: string }>(res)
  if (!res.ok) return null
  if ('error' in data && data.error) return null
  return data as OsmSuggestionResponse
}
