import { useState } from 'react'
import { CLASSIFICATION_HEX, CLASSIFICATION_LABELS, CLASSIFICATION_ORDER, legendStepImageSources } from '../classificationLabels'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

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
      className="w-full h-28 object-cover rounded-md border border-border bg-muted"
      onError={() => setSrc((s) => (s === webp ? svg : s))}
    />
  )
}

export default function LegendOverlay({ open, onClose }: LegendOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle id="legend-title">Legende: Fassaden-Stufen</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[min(75vh,560px)]">
          <div className="space-y-4 p-4">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">Skala</p>
              <div className="relative h-10 overflow-hidden rounded-lg border border-border">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, ${CLASSIFICATION_HEX.stuck_perfekt} 0%, ${CLASSIFICATION_HEX.stuck_schoen} 25%, ${CLASSIFICATION_HEX.stuck_mittel} 50%, ${CLASSIFICATION_HEX.stuck_teilweise} 75%, ${CLASSIFICATION_HEX.entstuckt} 100%)`,
                  }}
                />
              </div>
              <div className="text-muted-foreground mt-1 flex justify-between text-xs">
                <span>schöner Stuck</span>
                <span>entstuckt</span>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Ersetze die Bilder unter <code className="text-foreground">public/legend/stufe-1.webp</code> …{' '}
              <code className="text-foreground">stufe-5.webp</code> durch deine Fotos (WebP oder PNG umbenennen).
            </p>
            <Separator />
            <ul className="space-y-3">
              {CLASSIFICATION_ORDER.map((cls, i) => (
                <li
                  key={cls}
                  className="border-border flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
                >
                  <span
                    className="mt-1 h-4 w-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: CLASSIFICATION_HEX[cls] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Stufe {i + 1}</div>
                    <p className="text-muted-foreground mt-0.5 text-sm">{CLASSIFICATION_LABELS[cls]}</p>
                    <div className="mt-2">
                      <LegendStepImage step={i + 1} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
