import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import type { BuildingClassification } from '../types'
import { useClassification } from '../context/ClassificationContext'
import type { SelectedBuildingGeo } from './MapView'
import { segmentStorageKey } from '../utils/segmentStorageKey'
import {
  CLASSIFICATION_HEX,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
} from '../classificationLabels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface BuildingDetailPanelProps {
  buildings: SelectedBuildingGeo[]
  onClose: () => void
  isEditor: boolean
  onDeselectAll?: () => void
}

const BTN_RING: Record<Exclude<BuildingClassification, null>, string> = {
  altbau_gruen: 'ring-green-500',
  altbau_gelb: 'ring-yellow-400',
  altbau_rot: 'ring-red-500',
  kein_altbau: 'ring-neutral-600',
}

function ClassificationButtons({
  onClassify,
  activeClassification,
}: {
  onClassify: (c: BuildingClassification) => void
  activeClassification?: BuildingClassification
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CLASSIFICATION_ORDER.map((cls, i) => {
        const active = activeClassification === cls
        const hex = CLASSIFICATION_HEX[cls]
        const darkLabel = cls === 'altbau_gelb'
        return (
          <Button
            key={cls}
            type="button"
            variant="outline"
            size="sm"
            title={CLASSIFICATION_LABELS[cls]}
            onClick={() => onClassify(cls)}
            className={cn(
              'min-w-[2.25rem] border-border',
              active && `ring-2 ring-offset-2 ring-offset-background ${BTN_RING[cls]}`
            )}
            style={{
              backgroundColor: hex,
              color: darkLabel ? '#1e293b' : '#fff',
            }}
          >
            {i + 1}
          </Button>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        title={CLASSIFICATION_LABELS.kein_altbau}
        onClick={() => onClassify('kein_altbau')}
        className={cn(
          'min-w-[2.25rem] border-border bg-neutral-900 text-white hover:bg-neutral-800',
          activeClassification === 'kein_altbau' &&
            'ring-2 ring-offset-2 ring-offset-background ring-neutral-600'
        )}
      >
        K
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => onClassify(null)}>
        Zurücksetzen
      </Button>
    </div>
  )
}

function osmLinkFromId(id: string): string | null {
  const m = id.match(/^(way|rel)-(\d+)$/)
  if (!m) return null
  const type = m[1] === 'rel' ? 'relation' : 'way'
  return `https://www.openstreetmap.org/${type}/${m[2]}`
}

function SingleBuildingDetail({ building, isEditor }: { building: SelectedBuildingGeo; isEditor: boolean }) {
  const { getClassification, setClassification, getYearOfConstruction, setYearOfConstruction } = useClassification()
  const storageKey = useMemo(() => segmentStorageKey(building.id, building.geometry), [building.id, building.geometry])
  const classification = getClassification(storageKey)
  const savedYear = getYearOfConstruction(storageKey)
  const [yearInput, setYearInput] = useState<string>(savedYear != null ? String(savedYear) : '')

  useEffect(() => {
    setYearInput(savedYear != null ? String(savedYear) : '')
  }, [storageKey, savedYear])

  const renderHeight = building.properties['render_height'] as number | undefined
  const height = renderHeight != null ? `${renderHeight} m` : '–'
  const osmLink = osmLinkFromId(building.id)

  const commitYear = () => {
    const n = parseInt(yearInput, 10)
    setYearOfConstruction(storageKey, isNaN(n) ? null : n)
  }

  return (
    <>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="text-muted-foreground">ID</dt>
          <dd>
            {osmLink ? (
              <a
                href={osmLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-90"
              >
                {building.id}
              </a>
            ) : (
              building.id
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Höhe</dt>
          <dd>{height}</dd>
        </div>
        {classification && (
          <div>
            <dt className="text-muted-foreground">Klassifizierung</dt>
            <dd>{CLASSIFICATION_LABELS[classification]}</dd>
          </div>
        )}
        {savedYear != null && (
          <div>
            <dt className="text-muted-foreground">Baujahr</dt>
            <dd>{savedYear}</dd>
          </div>
        )}
      </dl>
      {isEditor && (
        <>
          <Separator className="my-4" />
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              Stufe wählen (1–3: Altbau-Qualität, K = kein Altbau, nur in der Editor-Karte sichtbar):
            </p>
            <ClassificationButtons
              onClassify={(c) => setClassification(storageKey, c, undefined, building.geometry)}
              activeClassification={classification}
            />
            {classification && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="year-input" className="text-muted-foreground text-xs">
                  Baujahr (optional)
                </Label>
                <Input
                  id="year-input"
                  type="number"
                  min={1200}
                  max={new Date().getFullYear()}
                  placeholder="z.B. 1897"
                  value={yearInput}
                  onChange={(e) => setYearInput(e.target.value)}
                  onBlur={commitYear}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitYear()
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

function MultiBuildingDetail({
  buildings,
  isEditor,
  onDeselectAll,
}: {
  buildings: SelectedBuildingGeo[]
  isEditor: boolean
  onDeselectAll?: () => void
}) {
  const { setClassification } = useClassification()

  const classifyAll = (c: BuildingClassification) => {
    for (const b of buildings) {
      setClassification(segmentStorageKey(b.id, b.geometry), c, undefined, b.geometry)
    }
    onDeselectAll?.()
  }

  return (
    <>
      <p className="text-sm">{buildings.length} Gebäude ausgewählt</p>
      {isEditor && (
        <>
          <Separator className="my-4" />
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">Alle klassifizieren:</p>
            <ClassificationButtons onClassify={classifyAll} />
          </div>
        </>
      )}
    </>
  )
}

export default function BuildingDetailPanel({ buildings, onClose, isEditor, onDeselectAll }: BuildingDetailPanelProps) {
  const isSingle = buildings.length === 1

  return (
    <Card className="min-w-[240px] max-h-[80vh] overflow-y-auto shadow-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">{isSingle ? 'Gebäude' : `${buildings.length} Gebäude`}</CardTitle>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Schließen">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isSingle ? (
          <SingleBuildingDetail building={buildings[0]} isEditor={isEditor} />
        ) : (
          <MultiBuildingDetail buildings={buildings} isEditor={isEditor} onDeselectAll={onDeselectAll} />
        )}
      </CardContent>
    </Card>
  )
}
