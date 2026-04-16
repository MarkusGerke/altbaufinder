import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Geometry } from 'geojson'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { AUTH_TOKEN_KEY } from '@/services/authApi'
import { BuildingPhotoReport } from '@/components/BuildingPhotoReport'
import {
  buildingPhotoServeUrl,
  deleteBuildingPhoto,
  fetchBuildingPhotoStatus,
  moderateBuildingPhoto,
  PHOTO_UPLOAD_MAX_DISTANCE_M,
  uploadBuildingPhoto,
  type BuildingPhotoInfo,
  type BuildingPhotoStatusResponse,
} from '@/services/buildingPhotoApi'
import { geoJsonPolygonCentroid, haversineMeters } from '@/utils/geoUtils'

type Props = {
  buildingId: string
  buildingGeometry: Geometry | null | undefined
}

function moderationLabel(s: BuildingPhotoInfo['moderationStatus']): string {
  if (s === 'approved') return 'Freigegeben – öffentlich sichtbar'
  if (s === 'rejected') return 'Abgelehnt – bitte neues Foto hochladen oder löschen'
  if (s === 'pending') return 'In Prüfung – noch nicht öffentlich'
  return ''
}

export function BuildingPhotoCapture({ buildingId, buildingGeometry }: Props) {
  const { isLoggedIn, user } = useAuth()
  const cameraInputId = useId()
  const [status, setStatus] = useState<BuildingPhotoStatusResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  /**
   * Safari/iOS: programmatisches input.click() nach Geolocation-Callback zählt nicht als Nutzer-Geste.
   * Zweiter Schritt: sichtbares <label htmlFor> – echter Tap öffnet die Kamera.
   */
  const [geoOkForCamera, setGeoOkForCamera] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const centroid = geoJsonPolygonCentroid(buildingGeometry ?? null)

  const revokePreview = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setStatus(null)
      return
    }
    const s = await fetchBuildingPhotoStatus(buildingId)
    setStatus(s)
  }, [buildingId, isLoggedIn])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setGeoOkForCamera(false)
  }, [buildingId])

  useEffect(() => {
    revokePreview()
    const p = status?.photo
    if (!p?.hasPhoto) {
      return undefined
    }

    if (p.moderationStatus === 'approved' && p.publicImagePath) {
      const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
      const path = p.publicImagePath.replace(/^\//, '')
      if (base.startsWith('http')) {
        setPreviewUrl(`${base}/${path}`)
      } else {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const b = base.startsWith('/') ? base : `/${base}`
        setPreviewUrl(`${origin}${b}/${path}`)
      }
      return undefined
    }

    if (p.moderationStatus === 'pending' || p.moderationStatus === 'rejected') {
      const canPreview = p.isUploader || user?.isPhotoModerator === true
      if (!canPreview) {
        return undefined
      }
      const url = buildingPhotoServeUrl(buildingId)
      let cancelled = false
      void (async () => {
        try {
          const t = localStorage.getItem(AUTH_TOKEN_KEY)
          const res = await fetch(url, {
            headers: t ? { Authorization: `Bearer ${t}` } : {},
          })
          if (!res.ok || cancelled) return
          const blob = await res.blob()
          if (cancelled) return
          const u = URL.createObjectURL(blob)
          blobUrlRef.current = u
          setPreviewUrl(u)
        } catch {
          /* ignore */
        }
      })()
      return () => {
        cancelled = true
      }
    }
    return undefined
  }, [status, buildingId, user?.isPhotoModerator, revokePreview])

  useEffect(() => () => revokePreview(), [buildingId, revokePreview])

  const onStandortPruefen = useCallback(() => {
    setHint(null)
    setGeoOkForCamera(false)
    if (!centroid) {
      setHint('Kein Gebäudeumriss – bitte Gebäude erneut anklicken oder Klassifikation speichern.')
      return
    }
    if (!status?.canUpload) {
      setHint(
        status?.reason ??
          'Bitte zuerst eine Stufe wählen und mit „Speichern“ in der Toolbar sichern (Umriss nötig für den Abstand).'
      )
      return
    }
    setBusy(true)
    setHint('Standort wird geprüft …')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const d = haversineMeters({ lat, lng }, { lat: centroid.lat, lng: centroid.lng })
        const ok = d <= PHOTO_UPLOAD_MAX_DISTANCE_M
        setBusy(false)
        if (!ok) {
          setGeoOkForCamera(false)
          setHint(`Zu weit vom Gebäude (ca. ${Math.round(d)} m, max. ${PHOTO_UPLOAD_MAX_DISTANCE_M} m).`)
          return
        }
        setHint(
          `Im Umkreis (${Math.round(d)} m). Tippen Sie auf „Kamera öffnen“ (unter iOS nötig, damit Safari die Kamera startet).`
        )
        setGeoOkForCamera(true)
      },
      () => {
        setBusy(false)
        setGeoOkForCamera(false)
        setHint('Standort nicht verfügbar. Bitte Standortfreigabe erteilen oder GPS aktivieren.')
      },
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 0 }
    )
  }, [centroid, status])

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setGeoOkForCamera(false)
    if (!file || !status?.canUpload || !centroid) return
    setBusy(true)
    setHint('Wird hochgeladen …')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        })
      })
      const msg = await uploadBuildingPhoto(
        buildingId,
        pos.coords.latitude,
        pos.coords.longitude,
        file,
        file.name || 'photo.jpg'
      )
      setHint(msg.message)
      await refresh()
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!status?.photo.canDelete) return
    setBusy(true)
    setHint(null)
    try {
      await deleteBuildingPhoto(buildingId)
      setHint('Foto gelöscht.')
      await refresh()
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const onModerate = async (action: 'approve' | 'reject') => {
    setBusy(true)
    setHint(null)
    try {
      await moderateBuildingPhoto(buildingId, action)
      setHint(action === 'approve' ? 'Foto freigegeben.' : 'Foto abgelehnt.')
      await refresh()
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Moderation fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  if (!isLoggedIn) {
    return (
      <p className="text-muted-foreground text-xs">
        Melden Sie sich an, um ein Foto aufzunehmen (nach Speichern der Klassifikation mit Gebäudeumriss).
      </p>
    )
  }

  if (user?.canUploadPhotos === false) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        Foto-Uploads sind für dein Konto noch nicht freigeschaltet. Du kannst aufnehmen, sobald ein Administrator
        dein Konto freigibt. Die Kartennutzung und Markierungen bleiben davon unberührt.
      </p>
    )
  }

  const p = status?.photo

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs leading-relaxed">
        <strong className="text-foreground">Ablauf:</strong> Stufe setzen und in der Toolbar speichern. Zuerst{' '}
        <strong className="text-foreground">Standort prüfen</strong>. Liegt alles im Radius, erscheint{' '}
        <strong className="text-foreground">Kamera öffnen</strong> – darauf tippen (Safari/iOS). Standort wird nicht
        gespeichert. Max. {PHOTO_UPLOAD_MAX_DISTANCE_M} m zum Gebäude.
      </p>
      <Button
        type="button"
        className="w-full"
        disabled={busy || !centroid}
        onClick={onStandortPruefen}
      >
        {busy ? 'Bitte warten …' : geoOkForCamera ? 'Standort erneut prüfen' : '1. Standort prüfen'}
      </Button>
      {geoOkForCamera && (
        <label
          htmlFor={cameraInputId}
          className="border-input bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-xs"
        >
          2. Kamera öffnen
        </label>
      )}
      <input
        id={cameraInputId}
        type="file"
        className="sr-only"
        accept="image/*"
        capture="environment"
        onChange={onPickFile}
      />
      {p?.hasPhoto && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <p className="text-muted-foreground text-xs">{moderationLabel(p.moderationStatus)}</p>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Gebäudefoto"
              className="max-h-40 w-full rounded object-cover"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {p.canDelete && (
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
                Foto löschen
              </Button>
            )}
            {user?.isPhotoModerator === true && p.moderationStatus === 'pending' && (
              <>
                <Button type="button" size="sm" variant="default" disabled={busy} onClick={() => void onModerate('approve')}>
                  Freigeben
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onModerate('reject')}>
                  Ablehnen
                </Button>
              </>
            )}
          </div>
          {p.moderationStatus === 'approved' && <BuildingPhotoReport buildingId={buildingId} />}
        </div>
      )}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
