import { useCallback, useRef, useState } from 'react'
import MapView, { type SelectedBuildingGeo } from './components/MapView'
import Toolbar, { type FilterState } from './components/Toolbar'
import BuildingDetailPanel from './components/BuildingDetailPanel'
import { useClassification } from './context/ClassificationContext'
import type { AppMode } from './types'
import type { ClassificationEntry } from './types'
import { segmentStorageKey } from './utils/segmentStorageKey'

const DEFAULT_FILTERS: FilterState = {
  showGreen: true,
  showYellow: true,
  showRed: true,
  showUnclassified: true,
}

const EXPORT_FILENAME = 'altbaufinder-classifications.json'

function App() {
  const [appMode, setAppMode] = useState<AppMode>('viewer')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [whiteMode, setWhiteMode] = useState(false)
  const [selectedBuildings, setSelectedBuildings] = useState<SelectedBuildingGeo[]>([])
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { classifications, importClassifications } = useClassification()

  const onBuildingClick = useCallback(
    (building: SelectedBuildingGeo, shiftKey: boolean) => {
      setSelectedBuildings((prev) => {
        const isMulti = shiftKey || multiSelectMode
        const clickKey = segmentStorageKey(building.id, building.geometry)
        const existsById = prev.some((b) => b.id === building.id)
        const existsByKey = prev.some((b) => segmentStorageKey(b.id, b.geometry) === clickKey)
        if (isMulti) {
          // #region agent log
          fetch('http://127.0.0.1:7858/ingest/56e6680e-87b3-4f0d-9b35-c2b920d9c2ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c37930'},body:JSON.stringify({sessionId:'c37930',location:'App.tsx:onBuildingClick',message:'multi-select click',data:{hypothesisId:'H1',buildingId:building.id,clickKey,prevCount:prev.length,existsById,existsByKey,action:existsByKey?'toggleOffSegment':'add'},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
          // #endregion
          if (existsByKey) {
            return prev.filter((b) => segmentStorageKey(b.id, b.geometry) !== clickKey)
          }
          return [...prev, building]
        }
        return [building]
      })
    },
    [multiSelectMode]
  )

  const handleExport = useCallback(() => {
    const payload = { exportedAt: new Date().toISOString(), classifications }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = EXPORT_FILENAME
    a.click()
    URL.revokeObjectURL(url)
  }, [classifications])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          const data = JSON.parse(text) as { classifications?: Record<string, ClassificationEntry> }
          const map = data.classifications ?? data
          if (typeof map === 'object' && map !== null) {
            importClassifications(map as Record<string, ClassificationEntry>)
          }
        } catch {
          // invalid JSON or structure – ignore
        }
      }
      reader.readAsText(file)
    },
    [importClassifications]
  )

  return (
    <div className="w-full h-screen flex flex-col">
      <header className="flex-shrink-0 px-4 py-2 bg-slate-800 text-white shadow flex items-center justify-between">
        <h1 className="text-lg font-semibold">Altbaufinder Berlin</h1>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-300 hover:text-white"
        >
          © OpenStreetMap
        </a>
      </header>
      <Toolbar
        appMode={appMode}
        onAppModeChange={setAppMode}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        whiteMode={whiteMode}
        onWhiteModeChange={setWhiteMode}
        multiSelectMode={multiSelectMode}
        onMultiSelectModeChange={setMultiSelectMode}
        onDeselectAll={() => setSelectedBuildings([])}
        selectedCount={selectedBuildings.length}
        onExport={handleExport}
        onImport={handleImport}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        onChange={onFileChange}
      />
      <main className="flex-1 min-h-0 flex relative">
        <MapView
          onBuildingClick={onBuildingClick}
          filters={filters}
          viewMode={viewMode}
          whiteMode={whiteMode}
          selectedBuildings={selectedBuildings}
        />
        {selectedBuildings.length > 0 && (
          <>
            <div className="hidden md:block absolute top-4 right-4 z-10">
              <BuildingDetailPanel
                buildings={selectedBuildings}
                onClose={() => setSelectedBuildings([])}
                isEditor={appMode === 'editor'}
                onDeselectAll={() => setSelectedBuildings([])}
              />
            </div>
            <div className="md:hidden absolute bottom-0 left-0 right-0 z-10 animate-slide-up [&>div]:rounded-b-none [&>div]:rounded-t-xl [&>div]:max-h-[60vh]">
              <BuildingDetailPanel
                buildings={selectedBuildings}
                onClose={() => setSelectedBuildings([])}
                isEditor={appMode === 'editor'}
                onDeselectAll={() => setSelectedBuildings([])}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
