import { useState, useEffect } from 'react'
import type { BuildingClassification } from '../types'
import { useClassification } from '../context/ClassificationContext'

export interface SelectedBuilding {
  id: string
  properties: Record<string, unknown>
}

interface BuildingDetailPanelProps {
  buildings: SelectedBuilding[]
  onClose: () => void
  isEditor: boolean
  onDeselectAll?: () => void
}

const LABELS: Record<Exclude<BuildingClassification, null>, string> = {
  original: 'Original (bestuckt)',
  altbau_entstuckt: 'Entstuckt / verunstaltet',
  kein_altbau: 'Nicht mehr vorhanden',
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
      <button
        type="button"
        onClick={() => onClassify('original')}
        className={`px-2 py-1 rounded text-sm ${activeClassification === 'original' ? 'ring-2 ring-offset-1 ring-offset-slate-700 ring-green-400 bg-green-600' : 'bg-green-700 hover:bg-green-600'}`}
      >
        Grün
      </button>
      <button
        type="button"
        onClick={() => onClassify('altbau_entstuckt')}
        className={`px-2 py-1 rounded text-sm ${activeClassification === 'altbau_entstuckt' ? 'ring-2 ring-offset-1 ring-offset-slate-700 ring-yellow-400 bg-yellow-600' : 'bg-yellow-700 hover:bg-yellow-600'}`}
      >
        Gelb
      </button>
      <button
        type="button"
        onClick={() => onClassify('kein_altbau')}
        className={`px-2 py-1 rounded text-sm ${activeClassification === 'kein_altbau' ? 'ring-2 ring-offset-1 ring-offset-slate-700 ring-red-400 bg-red-600' : 'bg-red-700 hover:bg-red-600'}`}
      >
        Rot
      </button>
      <button
        type="button"
        onClick={() => onClassify(null)}
        className="px-2 py-1 rounded text-sm bg-slate-600 hover:bg-slate-500"
      >
        Zurücksetzen
      </button>
    </div>
  )
}

function osmLinkFromId(id: string): string | null {
  const m = id.match(/^(way|rel)-(\d+)$/)
  if (!m) return null
  const type = m[1] === 'rel' ? 'relation' : 'way'
  return `https://www.openstreetmap.org/${type}/${m[2]}`
}

function SingleBuildingDetail({ building, isEditor }: { building: SelectedBuilding; isEditor: boolean }) {
  const { getClassification, setClassification, getYearOfConstruction, setYearOfConstruction, hasPendingChanges, saveAllPending } = useClassification()
  const classification = getClassification(building.id)
  const savedYear = getYearOfConstruction(building.id)
  const [yearInput, setYearInput] = useState<string>(savedYear != null ? String(savedYear) : '')

  useEffect(() => {
    setYearInput(savedYear != null ? String(savedYear) : '')
  }, [building.id, savedYear])

  const renderHeight = building.properties['render_height'] as number | undefined
  const height = renderHeight != null ? `${renderHeight} m` : '–'
  const osmLink = osmLinkFromId(building.id)

  const commitYear = () => {
    const n = parseInt(yearInput, 10)
    setYearOfConstruction(building.id, isNaN(n) ? null : n)
  }

  return (
    <>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="text-slate-400">ID</dt>
          <dd>
            {osmLink ? (
              <a href={osmLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                {building.id}
              </a>
            ) : building.id}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Höhe</dt>
          <dd>{height}</dd>
        </div>
        {classification && (
          <div>
            <dt className="text-slate-400">Klassifizierung</dt>
            <dd>{LABELS[classification]}</dd>
          </div>
        )}
        {savedYear != null && (
          <div>
            <dt className="text-slate-400">Baujahr</dt>
            <dd>{savedYear}</dd>
          </div>
        )}
      </dl>
      {isEditor && (
        <div className="mt-4 pt-3 border-t border-slate-600 space-y-2">
          <p className="text-slate-400 text-xs">Klassifizierung setzen:</p>
          <ClassificationButtons
            onClassify={(c) => setClassification(building.id, c)}
            activeClassification={classification}
          />
          {classification && (
            <div className="mt-3">
              <label className="block text-slate-400 text-xs mb-1" htmlFor="year-input">Baujahr (optional)</label>
              <input
                id="year-input"
                type="number"
                min="1200"
                max={new Date().getFullYear()}
                placeholder="z.B. 1897"
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
                onBlur={commitYear}
                onKeyDown={(e) => { if (e.key === 'Enter') commitYear() }}
                className="w-full px-2 py-1 rounded text-sm bg-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          )}
          {hasPendingChanges && (
            <button
              type="button"
              onClick={saveAllPending}
              className="mt-3 w-full px-3 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Speichern
            </button>
          )}
        </div>
      )}
    </>
  )
}

function MultiBuildingDetail({ buildings, isEditor, onDeselectAll }: { buildings: SelectedBuilding[]; isEditor: boolean; onDeselectAll?: () => void }) {
  const { setClassification, hasPendingChanges, saveAllPending } = useClassification()

  const classifyAll = (c: BuildingClassification) => {
    for (const b of buildings) {
      setClassification(b.id, c)
    }
    onDeselectAll?.()
  }

  return (
    <>
      <p className="text-sm text-slate-300">{buildings.length} Gebäude ausgewählt</p>
      {isEditor && (
        <div className="mt-4 pt-3 border-t border-slate-600 space-y-2">
          <p className="text-slate-400 text-xs">Alle klassifizieren:</p>
          <ClassificationButtons onClassify={classifyAll} />
          {hasPendingChanges && (
            <button
              type="button"
              onClick={saveAllPending}
              className="mt-2 w-full px-3 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Speichern
            </button>
          )}
        </div>
      )}
    </>
  )
}

export default function BuildingDetailPanel({ buildings, onClose, isEditor, onDeselectAll }: BuildingDetailPanelProps) {
  const isSingle = buildings.length === 1

  return (
    <div className="bg-slate-700 text-white rounded-lg shadow-lg p-4 min-w-[240px] max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-start gap-2 mb-3">
        <h3 className="font-semibold text-slate-100">
          {isSingle ? 'Gebäude' : `${buildings.length} Gebäude`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white leading-none"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>
      {isSingle ? (
        <SingleBuildingDetail building={buildings[0]} isEditor={isEditor} />
      ) : (
        <MultiBuildingDetail buildings={buildings} isEditor={isEditor} onDeselectAll={onDeselectAll} />
      )}
    </div>
  )
}
