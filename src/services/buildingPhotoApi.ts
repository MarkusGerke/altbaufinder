import { readJsonResponse } from '@/lib/readJsonResponse'
import { AUTH_TOKEN_KEY } from './authApi'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

/** Ohne Login: ob für dieses Gebäude ein freigegebenes Foto existiert (für Viewer-Panel). */
export async function fetchBuildingPhotoHasPublicApproved(buildingId: string): Promise<boolean> {
  const q = new URLSearchParams({ building_id: buildingId, public: '1' })
  try {
    const res = await fetch(`${API_BASE}/building-photo.php?${q}`)
    if (!res.ok) return false
    const data = await readJsonResponse<{ hasApprovedPhoto?: boolean }>(res)
    return data.hasApprovedPhoto === true
  } catch {
    return false
  }
}

/** Muss mit api/building-photo.php PHOTO_MAX_DISTANCE_M übereinstimmen. */
export const PHOTO_UPLOAD_MAX_DISTANCE_M = 250

export type PhotoModerationStatus = 'pending' | 'approved' | 'rejected'

export type BuildingPhotoInfo = {
  hasPhoto: boolean
  moderationStatus: PhotoModerationStatus | null
  isUploader: boolean
  canDelete: boolean
  publicImagePath: string | null
}

export type BuildingPhotoStatusResponse = {
  canUpload: boolean
  reason?: string | null
  photo: BuildingPhotoInfo
}

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(AUTH_TOKEN_KEY)
    if (t) return { Authorization: `Bearer ${t}` }
  } catch {
    /* ignore */
  }
  return {}
}

function apiBaseNorm(): string {
  return (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
}

/** URL zum Bild (approved öffentlich; pending/rejected nur mit Anmeldung für Berechtigte). */
export function buildingPhotoServeUrl(buildingId: string): string {
  const base = apiBaseNorm()
  const q = `building-photo-serve.php?building_id=${encodeURIComponent(buildingId)}`
  if (base.startsWith('http')) {
    return `${base}/${q}`
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const b = base.startsWith('/') ? base : `/${base}`
  return `${origin}${b}/${q}`
}

export async function fetchBuildingPhotoStatus(buildingId: string): Promise<BuildingPhotoStatusResponse> {
  const q = new URLSearchParams({ building_id: buildingId })
  const res = await fetch(`${API_BASE}/building-photo.php?${q}`, { headers: authHeaders() })
  const emptyPhoto: BuildingPhotoInfo = {
    hasPhoto: false,
    moderationStatus: null,
    isUploader: false,
    canDelete: false,
    publicImagePath: null,
  }
  const data = await readJsonResponse<BuildingPhotoStatusResponse & { error?: string }>(res)
  if (!res.ok) {
    return {
      canUpload: false,
      reason: res.status === 401 ? 'Anmeldung erforderlich' : 'Anfrage fehlgeschlagen',
      photo: data.photo ?? emptyPhoto,
    }
  }
  return {
    canUpload: data.canUpload ?? false,
    reason: data.reason ?? null,
    photo: data.photo ?? emptyPhoto,
  }
}

export async function uploadBuildingPhoto(
  buildingId: string,
  lat: number,
  lng: number,
  file: Blob,
  filename: string
): Promise<{ ok: boolean; moderationStatus: PhotoModerationStatus; message: string }> {
  const fd = new FormData()
  fd.set('building_id', buildingId)
  fd.set('lat', String(lat))
  fd.set('lng', String(lng))
  fd.set('photo', file, filename)
  const res = await fetch(`${API_BASE}/building-photo.php`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  })
  const data = await readJsonResponse<{
    ok?: boolean
    moderationStatus?: PhotoModerationStatus
    message?: string
    error?: string
  }>(res)
  if (!res.ok) {
    throw new Error(data.error ?? `Upload fehlgeschlagen (${res.status})`)
  }
  if (!data.ok || !data.moderationStatus) {
    throw new Error(data.error ?? 'Ungültige Server-Antwort')
  }
  return {
    ok: true,
    moderationStatus: data.moderationStatus,
    message: data.message ?? 'Hochgeladen.',
  }
}

export async function deleteBuildingPhoto(buildingId: string): Promise<void> {
  const q = new URLSearchParams({ building_id: buildingId })
  const res = await fetch(`${API_BASE}/building-photo.php?${q}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  const data = await readJsonResponse<{ error?: string }>(res)
  if (!res.ok) {
    throw new Error(data.error ?? `Löschen fehlgeschlagen (${res.status})`)
  }
}

export async function moderateBuildingPhoto(
  buildingId: string,
  action: 'approve' | 'reject'
): Promise<PhotoModerationStatus> {
  const res = await fetch(`${API_BASE}/building-photo-moderate.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ buildingId, action }),
  })
  const data = await readJsonResponse<{ moderationStatus?: PhotoModerationStatus; error?: string }>(res)
  if (!res.ok) {
    throw new Error(data.error ?? `Moderation fehlgeschlagen (${res.status})`)
  }
  if (!data.moderationStatus) throw new Error('Ungültige Antwort')
  return data.moderationStatus
}
