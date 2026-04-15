import { useEffect, useState } from 'react'
import { fetchLeaderboard, type LeaderboardRow } from '../services/authApi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface LeaderboardPanelProps {
  open: boolean
  onClose: () => void
}

export default function LeaderboardPanel({ open, onClose }: LeaderboardPanelProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchLeaderboard()
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle id="lb-title">Highscore (Top 10)</DialogTitle>
        </DialogHeader>
        <div className="pt-1">
          {loading ? (
            <p className="text-muted-foreground text-sm">Lade …</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Noch keine Einträge.</p>
          ) : (
            <ol className="space-y-2">
              {rows.map((r) => (
                <li
                  key={`${r.rank}-${r.displayName}`}
                  className="border-border flex justify-between gap-2 border-b pb-2 text-sm last:border-0"
                >
                  <span className="text-foreground">
                    <span className="text-muted-foreground mr-2">{r.rank}.</span>
                    {r.displayName}
                  </span>
                  <span className="font-medium tabular-nums">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
