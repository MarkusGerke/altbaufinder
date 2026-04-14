import { useEffect, useState } from 'react'
import { fetchLeaderboard, type LeaderboardRow } from '../services/authApi'

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-title"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 text-white rounded-xl shadow-xl max-w-md w-full border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-slate-600">
          <h2 id="lb-title" className="text-lg font-semibold">
            Highscore (Top 10)
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-1" aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm">Lade …</p>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 text-sm">Noch keine Einträge.</p>
          ) : (
            <ol className="space-y-2">
              {rows.map((r) => (
                <li key={`${r.rank}-${r.emailMasked}`} className="flex justify-between gap-2 text-sm border-b border-slate-700 pb-2 last:border-0">
                  <span className="text-slate-300">
                    <span className="text-slate-500 mr-2">{r.rank}.</span>
                    {r.emailMasked}
                  </span>
                  <span className="font-medium tabular-nums">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
