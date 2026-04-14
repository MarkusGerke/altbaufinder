import { readJsonResponse } from '@/lib/readJsonResponse'
import type { ClassificationEntry } from '../types'
import { AUTH_TOKEN_KEY } from './authApi'

type ClassificationState = Record<string, ClassificationEntry>

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(AUTH_TOKEN_KEY)
    if (t) return { Authorization: `Bearer ${t}` }
  } catch {
    /* ignore */
  }
  return {}
}

export async function fetchClassifications(): Promise<ClassificationState> {
  const res = await fetch(`${API_BASE}/classifications.php`)
  const data = await readJsonResponse<ClassificationState>(res)
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
  return data
}

export async function saveClassification(
  buildingId: string,
  entry: ClassificationEntry
): Promise<void> {
  const res = await fetch(`${API_BASE}/classifications.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ [buildingId]: entry }),
  })
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}

export async function saveClassificationsBatch(
  data: ClassificationState
): Promise<void> {
  const res = await fetch(`${API_BASE}/classifications.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}

export async function deleteClassification(buildingId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/classifications.php?id=${encodeURIComponent(buildingId)}`,
    { method: 'DELETE', headers: { ...authHeaders() } }
  )
  if (!res.ok) throw new Error(`API-Fehler: ${res.status}`)
}
