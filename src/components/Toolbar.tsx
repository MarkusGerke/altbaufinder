import { useState } from 'react'
import type { AppMode } from '../types'
import type { BuildingClassification } from '../types'
import { useClassification } from '../context/ClassificationContext'
import { CLASSIFICATION_HEX, CLASSIFICATION_ORDER, CLASSIFICATION_SHORT } from '../classificationLabels'

export interface FilterState {
  showStuckPerfekt: boolean
  showStuckSchoen: boolean
  showStuckMittel: boolean
  showStuckTeilweise: boolean
  showEntstuckt: boolean
  showUnclassified: boolean
}

const FILTER_KEY: Record<Exclude<BuildingClassification, null>, keyof FilterState> = {
  stuck_perfekt: 'showStuckPerfekt',
  stuck_schoen: 'showStuckSchoen',
  stuck_mittel: 'showStuckMittel',
  stuck_teilweise: 'showStuckTeilweise',
  entstuckt: 'showEntstuckt',
}

interface ToolbarProps {
  appMode: AppMode
  onAppModeChange: (mode: AppMode) => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  viewMode: '2d' | '3d'
  onViewModeChange: (mode: '2d' | '3d') => void
  whiteMode: boolean
  onWhiteModeChange: (value: boolean) => void
  multiSelectMode: boolean
  onMultiSelectModeChange: (value: boolean) => void
  onDeselectAll: () => void
  selectedCount: number
  onExport: () => void
  onImport: () => void
}

function ClassificationFilterToggles({
  filters,
  setFilter,
}: {
  filters: FilterState
  setFilter: (key: keyof FilterState, value: boolean) => void
}) {
  return (
    <>
      {CLASSIFICATION_ORDER.map((cls) => {
        const key = FILTER_KEY[cls]
        const hex = CLASSIFICATION_HEX[cls]
        return (
          <label key={cls} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilter(key, e.target.checked)}
              className="rounded"
            />
            <span
              className="w-3 h-3 rounded-full shrink-0 border border-slate-500/80"
              style={{ backgroundColor: hex }}
              aria-hidden
            />
            <span>{CLASSIFICATION_SHORT[cls]}</span>
          </label>
        )
      })}
    </>
  )
}

function ClassificationFilterDots({
  filters,
  setFilter,
}: {
  filters: FilterState
  setFilter: (key: keyof FilterState, value: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CLASSIFICATION_ORDER.map((cls) => {
        const key = FILTER_KEY[cls]
        const hex = CLASSIFICATION_HEX[cls]
        return (
          <label key={cls} className="flex items-center gap-1 cursor-pointer" title={CLASSIFICATION_SHORT[cls]}>
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilter(key, e.target.checked)}
              className="rounded"
            />
            <span
              className="w-3 h-3 rounded-full shrink-0 border border-slate-500/80"
              style={{ backgroundColor: hex }}
              aria-hidden
            />
          </label>
        )
      })}
    </div>
  )
}

export default function Toolbar({
  appMode,
  onAppModeChange,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  whiteMode,
  onWhiteModeChange,
  multiSelectMode,
  onMultiSelectModeChange,
  onDeselectAll,
  selectedCount,
  onExport,
  onImport,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { hasPendingChanges, saveAllPending } = useClassification()
  const setFilter = (key: keyof FilterState, value: boolean) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const toolbarContent = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-slate-300">Modus:</span>
        <button
          type="button"
          onClick={() => onAppModeChange('viewer')}
          className={`px-2 py-1 rounded ${appMode === 'viewer' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600 hover:bg-slate-500'}`}
        >
          Viewer
        </button>
        <button
          type="button"
          onClick={() => onAppModeChange('editor')}
          className={`px-2 py-1 rounded ${appMode === 'editor' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600 hover:bg-slate-500'}`}
        >
          Editor
        </button>
        {appMode === 'editor' && hasPendingChanges && (
          <button
            type="button"
            onClick={saveAllPending}
            className="px-2 py-1 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white"
          >
            Speichern
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-300">Ansicht:</span>
        <button
          type="button"
          onClick={() => onViewModeChange('2d')}
          className={`px-2 py-1 rounded ${viewMode === '2d' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600 hover:bg-slate-500'}`}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('3d')}
          className={`px-2 py-1 rounded ${viewMode === '3d' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600 hover:bg-slate-500'}`}
        >
          3D
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-slate-300">Filter:</span>
        <ClassificationFilterToggles filters={filters} setFilter={setFilter} />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showUnclassified}
            onChange={(e) => setFilter('showUnclassified', e.target.checked)}
            className="rounded"
          />
          <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" aria-hidden />
          <span>Unklassifiziert</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-300">Darstellung:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={whiteMode}
            onChange={(e) => onWhiteModeChange(e.target.checked)}
            className="rounded"
          />
          <span>Weißmodus</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-300">Auswahl:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={multiSelectMode}
            onChange={(e) => onMultiSelectModeChange(e.target.checked)}
            className="rounded"
          />
          <span>Mehrfach</span>
        </label>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-2 py-1 rounded text-sm bg-slate-600 hover:bg-slate-500"
          >
            Abwählen ({selectedCount})
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 md:ml-auto">
        <button
          type="button"
          onClick={onExport}
          className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onImport}
          className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500"
        >
          Import
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop toolbar */}
      <div className="hidden md:flex flex-wrap items-center gap-4 px-3 py-2 bg-slate-700 text-white text-sm shadow">
        {toolbarContent}
      </div>

      {/* Mobile toolbar */}
      <div className="md:hidden bg-slate-700 text-white text-sm shadow">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Modus:</span>
            <button
              type="button"
              onClick={() => onAppModeChange('viewer')}
              className={`px-2 py-1 rounded ${appMode === 'viewer' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600'}`}
            >
              Viewer
            </button>
            <button
              type="button"
              onClick={() => onAppModeChange('editor')}
              className={`px-2 py-1 rounded ${appMode === 'editor' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600'}`}
            >
              Editor
            </button>
            {appMode === 'editor' && hasPendingChanges && (
              <button
                type="button"
                onClick={saveAllPending}
                className="px-2 py-1 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white"
              >
                Speichern
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded bg-slate-600 hover:bg-slate-500"
            aria-label="Menü"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="px-3 pb-3 flex flex-col gap-3 border-t border-slate-600 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-300">Ansicht:</span>
              <button
                type="button"
                onClick={() => onViewModeChange('2d')}
                className={`px-2 py-1 rounded ${viewMode === '2d' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600'}`}
              >
                2D
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('3d')}
                className={`px-2 py-1 rounded ${viewMode === '3d' ? 'bg-slate-500 ring-1 ring-slate-400' : 'bg-slate-600'}`}
              >
                3D
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-300 shrink-0">Filter:</span>
              <ClassificationFilterDots filters={filters} setFilter={setFilter} />
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.showUnclassified}
                  onChange={(e) => setFilter('showUnclassified', e.target.checked)}
                  className="rounded"
                />
                <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" aria-hidden />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={whiteMode} onChange={(e) => onWhiteModeChange(e.target.checked)} className="rounded" />
                <span>Weißmodus</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={multiSelectMode} onChange={(e) => onMultiSelectModeChange(e.target.checked)} className="rounded" />
                <span>Mehrfach</span>
              </label>
              {selectedCount > 0 && (
                <button type="button" onClick={onDeselectAll} className="px-2 py-1 rounded text-sm bg-slate-600 hover:bg-slate-500">
                  Abwählen ({selectedCount})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={onExport} className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500">Export</button>
              <button type="button" onClick={onImport} className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500">Import</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
