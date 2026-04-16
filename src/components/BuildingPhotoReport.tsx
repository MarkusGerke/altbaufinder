import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { submitBuildingPhotoReport } from '@/services/buildingPhotoApi'

type Props = {
  buildingId: string
}

export function BuildingPhotoReport({ buildingId }: Props) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const onSend = async () => {
    setHint(null)
    const t = message.trim()
    if (t.length < 10) {
      setHint('Bitte mindestens 10 Zeichen eingeben.')
      return
    }
    setBusy(true)
    try {
      await submitBuildingPhotoReport(buildingId, t)
      setHint('Meldung wurde gesendet. Vielen Dank.')
      setMessage('')
      setOpen(false)
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Senden fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      {!open ? (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
          Foto melden
        </Button>
      ) : (
        <div className="space-y-2">
          <label htmlFor={fieldId} className="text-muted-foreground text-xs">
            Grund der Meldung (wird per E-Mail weitergeleitet)
          </label>
          <textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={4000}
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-y rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            placeholder="Bitte kurz beschreiben …"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void onSend()}>
              {busy ? 'Senden …' : 'Senden'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setHint(null)
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
