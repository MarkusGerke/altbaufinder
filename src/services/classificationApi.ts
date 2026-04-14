import type { ClassificationEntry } from '../types'

type ClassificationState = Record<string, ClassificationEntry>

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export async function fetchClassifications(): Promise<ClassificationState> {
  const res = await fetch(`${API_BASE}/classifications.php`)
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
  return res.json() as Promise<ClassificationState>
}

export async function saveClassification(
  buildingId: string,
  entry: ClassificationEntry
): Promise<void> {
  const res = await fetch(`${API_BASE}/classifications.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [buildingId]: entry }),
  })
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}

export async function saveClassificationsBatch(
  data: ClassificationState
): Promise<void> {
  const res = await fetch(`${API_BASE}/classifications.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}

export async function deleteClassification(buildingId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/classifications.php?id=${encodeURIComponent(buildingId)}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}
