import { useCallback, useEffect, useRef, useState } from 'react'
import MapView, { type SelectedBuildingGeo } from './components/MapView'
import Toolbar, { type FilterState } from './components/Toolbar'
import BuildingDetailPanel from './components/BuildingDetailPanel'
import LegendOverlay from './components/LegendOverlay'
import LeaderboardPanel from './components/LeaderboardPanel'
import AccountSettingsDialog from './components/AccountSettingsDialog'
import AuthModal from './components/AuthModal'
import PasswordResetDialog from './components/PasswordResetDialog'
import { Button } from '@/components/ui/button'
import { useClassification } from './context/ClassificationContext'
import { useAuth } from './context/AuthContext'
import type { AppMode } from './types'
import type { ClassificationEntry } from './types'
import { segmentStorageKey } from '@/utils/segmentStorageKey'

const DEFAULT_FILTERS: FilterState = {
  showAltbauGruen: true,
  showAltbauGelb: true,
  showAltbauRot: true,
  showKeinAltbau: true,
  showUnclassified: false,
}

const EXPORT_FILENAME = 'altbaufinder-classifications.json'

function App() {
  const { user, score, logout, isLoggedIn } = useAuth()
  const [legendOpen, setLegendOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('password-reset')
    if (t) {
      setPasswordResetToken(t)
      p.delete('password-reset')
      const q = p.toString()
      const path = window.location.pathname
      const hash = window.location.hash
      window.history.replaceState({}, '', `${path}${q ? `?${q}` : ''}${hash}`)
    }
  }, [])
  const [appMode, setAppMode] = useState<AppMode>('viewer')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [whiteMode, setWhiteMode] = useState(false)
  const [selectedBuildings, setSelectedBuildings] = useState<SelectedBuildingGeo[]>([])
  const [lassoSelectActive, setLassoSelectActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { classifications, importClassifications } = useClassification()

  useEffect(() => {
    if (appMode === 'viewer') setLassoSelectActive(false)
  }, [appMode])

  const onBuildingClick = useCallback((building: SelectedBuildingGeo) => {
    setSelectedBuildings((prev) => {
      const clickKey = segmentStorageKey(building.id, building.geometry)
      const existsByKey = prev.some((b) => segmentStorageKey(b.id, b.geometry) === clickKey)
      if (appMode === 'editor') {
        if (existsByKey) {
          return prev.filter((b) => segmentStorageKey(b.id, b.geometry) !== clickKey)
        }
        return [...prev, building]
      }
      return [building]
    })
  }, [appMode])

  const onLassoSelectBuildings = useCallback((buildings: SelectedBuildingGeo[]) => {
    setSelectedBuildings((prev) => {
      const keys = new Set(prev.map((b) => segmentStorageKey(b.id, b.geometry)))
      const next = [...prev]
      for (const b of buildings) {
        const k = segmentStorageKey(b.id, b.geometry)
        if (!keys.has(k)) {
          keys.add(k)
          next.push(b)
        }
      }
      return next
    })
  }, [])

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
    <div className="flex h-screen w-full flex-col">
      <header className="bg-card text-card-foreground flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 shadow-sm">
        <h1 className="text-lg font-semibold">Altbaufinder Berlin</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" onClick={() => setLegendOpen(true)}>
            Legende
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setLeaderboardOpen(true)}>
            Highscore
          </Button>
          {isLoggedIn ? (
            <>
              <span className="text-muted-foreground max-w-[10rem] truncate text-xs" title={user?.email}>
                {user?.email} · {score ?? 0} Pkt.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setAccountOpen(true)}>
                Konto
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={logout}>
                Abmelden
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => setAuthOpen(true)}>
              Login / Registrieren
            </Button>
          )}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            © OSM
          </a>
        </div>
      </header>
      <LegendOverlay open={legendOpen} onClose={() => setLegendOpen(false)} />
      <LeaderboardPanel open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <AccountSettingsDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
      <PasswordResetDialog
        open={passwordResetToken !== null}
        token={passwordResetToken ?? ''}
        onClose={() => setPasswordResetToken(null)}
      />
      <Toolbar
        appMode={appMode}
        onAppModeChange={setAppMode}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        whiteMode={whiteMode}
        onWhiteModeChange={setWhiteMode}
        onDeselectAll={() => setSelectedBuildings([])}
        selectedCount={selectedBuildings.length}
        lassoSelectActive={lassoSelectActive}
        onLassoSelectActiveChange={setLassoSelectActive}
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
          lassoSelectActive={lassoSelectActive}
          onLassoSelectBuildings={onLassoSelectBuildings}
          filters={filters}
          viewMode={viewMode}
          whiteMode={whiteMode}
          selectedBuildings={selectedBuildings}
          appMode={appMode}
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
