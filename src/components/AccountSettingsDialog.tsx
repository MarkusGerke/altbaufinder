import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AccountSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export default function AccountSettingsDialog({ open, onClose }: AccountSettingsDialogProps) {
  const { user, updateEmail, changePassword, deleteAccount } = useAuth()
  const [emailPwd, setEmailPwd] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const [deletePwd, setDeletePwd] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open && user?.email) {
      setNewEmail(user.email)
    }
  }, [open, user?.email])

  const resetForms = () => {
    setEmailPwd('')
    setNewEmail(user?.email ?? '')
    setOldPwd('')
    setNewPwd('')
    setNewPwd2('')
    setDeletePwd('')
    setDeleteConfirm('')
    setMsg(null)
    setErr(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose()
      resetForms()
    }
  }

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setPending(true)
    try {
      await updateEmail(emailPwd, newEmail.trim())
      setMsg('E-Mail wurde geändert.')
      setEmailPwd('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (newPwd !== newPwd2) {
      setErr('Neue Passwörter stimmen nicht überein.')
      return
    }
    setPending(true)
    try {
      await changePassword(oldPwd, newPwd)
      setMsg('Passwort wurde geändert.')
      setOldPwd('')
      setNewPwd('')
      setNewPwd2('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (deleteConfirm !== 'LÖSCHEN') {
      setErr('Bitte genau „LÖSCHEN“ in das Feld eintragen.')
      return
    }
    setPending(true)
    try {
      await deleteAccount(deletePwd)
      onClose()
      resetForms()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>Konto</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {err && <p className="text-destructive text-sm">{err}</p>}
          {msg && !err && <p className="text-muted-foreground text-sm">{msg}</p>}

          <form onSubmit={onSubmitEmail} className="space-y-3 border-b border-border pb-6">
            <p className="font-medium">E-Mail ändern</p>
            <div className="space-y-2">
              <Label htmlFor="acc-email-new">Neue E-Mail</Label>
              <Input
                id="acc-email-new"
                type="email"
                autoComplete="email"
                name="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user?.email ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-email-pwd">Aktuelles Passwort</Label>
              <Input
                id="acc-email-pwd"
                type="password"
                autoComplete="current-password"
                name="password"
                value={emailPwd}
                onChange={(e) => setEmailPwd(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              E-Mail speichern
            </Button>
          </form>

          <form onSubmit={onSubmitPassword} className="space-y-3 border-b border-border pb-6">
            <p className="font-medium">Passwort ändern</p>
            <div className="space-y-2">
              <Label htmlFor="acc-old-pwd">Aktuelles Passwort</Label>
              <Input
                id="acc-old-pwd"
                type="password"
                autoComplete="current-password"
                name="current-password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-new-pwd">Neues Passwort</Label>
              <Input
                id="acc-new-pwd"
                type="password"
                autoComplete="new-password"
                name="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-new-pwd2">Neues Passwort wiederholen</Label>
              <Input
                id="acc-new-pwd2"
                type="password"
                autoComplete="new-password"
                value={newPwd2}
                onChange={(e) => setNewPwd2(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Passwort speichern
            </Button>
          </form>

          <form onSubmit={onDelete} className="space-y-3">
            <p className="text-destructive font-medium">Konto löschen</p>
            <p className="text-muted-foreground text-xs">
              Alle deine Markierungen und das Konto werden unwiderruflich entfernt.
            </p>
            <div className="space-y-2">
              <Label htmlFor="acc-del-pwd">Passwort</Label>
              <Input
                id="acc-del-pwd"
                type="password"
                autoComplete="current-password"
                value={deletePwd}
                onChange={(e) => setDeletePwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-del-confirm">Zur Bestätigung „LÖSCHEN“ eintippen</Label>
              <Input
                id="acc-del-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              Konto endgültig löschen
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
