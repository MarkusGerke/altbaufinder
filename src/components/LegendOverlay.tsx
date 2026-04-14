import { useState } from 'react'
import { CLASSIFICATION_HEX, CLASSIFICATION_LABELS, CLASSIFICATION_ORDER, legendStepImageSources } from '../classificationLabels'

interface LegendOverlayProps {
  open: boolean
  onClose: () => void
}

function LegendStepImage({ step }: { step: number }) {
  const { webp, svg } = legendStepImageSources(step)
  const [src, setSrc] = useState(webp)
  return (
    <img
      src={src}
      alt=""
      className="w-full h-28 object-cover rounded border border-slate-600 bg-slate-800"
      onError={() => setSrc((s) => (s === webp ? svg : s))}
    />
  )
}

export default function LegendOverlay({ open, onClose }: LegendOverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legend-title"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 text-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-slate-600">
          <h2 id="legend-title" className="text-lg font-semibold">
            Legende: Fassaden-Stufen
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none px-1"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-slate-400 text-sm mb-2">Skala</p>
            <div className="relative h-10 rounded-lg overflow-hidden border border-slate-600">
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, ${CLASSIFICATION_HEX.stuck_perfekt} 0%, ${CLASSIFICATION_HEX.stuck_schoen} 25%, ${CLASSIFICATION_HEX.stuck_mittel} 50%, ${CLASSIFICATION_HEX.stuck_teilweise} 75%, ${CLASSIFICATION_HEX.entstuckt} 100%)`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-300 mt-1">
              <span>schöner Stuck</span>
              <span>entstuckt</span>
            </div>
          </div>
          <p className="text-slate-400 text-xs">
            Ersetze die Bilder unter <code className="text-slate-300">public/legend/stufe-1.webp</code> …{' '}
            <code className="text-slate-300">stufe-5.webp</code> durch deine Fotos (WebP oder PNG umbenennen).
          </p>
          <ul className="space-y-3">
            {CLASSIFICATION_ORDER.map((cls, i) => (
              <li key={cls} className="flex gap-3 items-start rounded-lg bg-slate-700/50 p-3 border border-slate-600/80">
                <span
                  className="w-4 h-4 rounded-full shrink-0 mt-1 border border-slate-500"
                  style={{ backgroundColor: CLASSIFICATION_HEX[cls] }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200">
                    Stufe {i + 1}
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{CLASSIFICATION_LABELS[cls]}</p>
                  <div className="mt-2">
                    <LegendStepImage step={i + 1} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
