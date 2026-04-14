import { useState } from 'react'
import { completePasswordReset } from '../services/authApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PasswordResetDialogProps {
  open: boolean
  token: string
  onClose: () => void
}

export default function PasswordResetDialog({ open, token, onClose }: PasswordResetDialogProps) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword('')
      setPassword2('')
      setErr(null)
      setOk(false)
      onClose()
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (password.length < 8) {
      setErr('Passwort mindestens 8 Zeichen.')
      return
    }
    if (password !== password2) {
      setErr('Passwörter stimmen nicht überein.')
      return
    }
    setPending(true)
    try {
      await completePasswordReset(token, password)
      setOk(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Neues Passwort setzen</DialogTitle>
        </DialogHeader>
        {ok ? (
          <p className="text-muted-foreground text-sm">
            Passwort wurde geändert. Du kannst dich jetzt anmelden.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3" id="password-reset-form">
            <div className="space-y-2">
              <Label htmlFor="reset-new-pwd">Neues Passwort</Label>
              <Input
                id="reset-new-pwd"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-new-pwd2">Wiederholen</Label>
              <Input
                id="reset-new-pwd2"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                minLength={8}
              />
            </div>
            {err && <p className="text-destructive text-sm">{err}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? '…' : 'Passwort speichern'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
