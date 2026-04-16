import { useState, type ReactNode } from 'react'
import { Menu, Spline } from 'lucide-react'
import type { AppMode } from '../types'
import type { BuildingClassification } from '../types'
import { useClassification } from '../context/ClassificationContext'
import {
  CLASSIFICATION_HEX,
  CLASSIFICATION_ORDER,
  CLASSIFICATION_ORDER_WITH_KEIN,
  CLASSIFICATION_SHORT,
} from '../classificationLabels'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export interface FilterState {
  showAltbauGruen: boolean
  showAltbauGelb: boolean
  showAltbauRot: boolean
  showKeinAltbau: boolean
  showUnclassified: boolean
}

const FILTER_KEY: Record<Exclude<BuildingClassification, null>, keyof FilterState> = {
  altbau_gruen: 'showAltbauGruen',
  altbau_gelb: 'showAltbauGelb',
  altbau_rot: 'showAltbauRot',
  kein_altbau: 'showKeinAltbau',
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
  onDeselectAll: () => void
  selectedCount: number
  lassoSelectActive: boolean
  onLassoSelectActiveChange: (active: boolean) => void
  onExport: () => void
  onImport: () => void
}

function ClassificationFilterToggles({
  filters,
  setFilter,
  idPrefix,
  appMode,
}: {
  filters: FilterState
  setFilter: (key: keyof FilterState, value: boolean) => void
  idPrefix: string
  appMode: AppMode
}) {
  const order =
    appMode === 'editor' ? CLASSIFICATION_ORDER_WITH_KEIN : CLASSIFICATION_ORDER
  return (
    <>
      {order.map((cls) => {
        const key = FILTER_KEY[cls]
        const hex = CLASSIFICATION_HEX[cls]
        const id = `${idPrefix}-f-${cls}`
        return (
          <div key={cls} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={filters[key]}
              onCheckedChange={(c) => setFilter(key, c === true)}
            />
            <Label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 font-normal">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: hex }}
                aria-hidden
              />
              {CLASSIFICATION_SHORT[cls]}
            </Label>
          </div>
        )
      })}
    </>
  )
}

function ClassificationFilterDots({
  filters,
  setFilter,
  idPrefix,
  appMode,
}: {
  filters: FilterState
  setFilter: (key: keyof FilterState, value: boolean) => void
  idPrefix: string
  appMode: AppMode
}) {
  const order =
    appMode === 'editor' ? CLASSIFICATION_ORDER_WITH_KEIN : CLASSIFICATION_ORDER
  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.map((cls) => {
        const key = FILTER_KEY[cls]
        const hex = CLASSIFICATION_HEX[cls]
        const id = `${idPrefix}-d-${cls}`
        return (
          <div key={cls} className="flex items-center gap-1" title={CLASSIFICATION_SHORT[cls]}>
            <Checkbox
              id={id}
              checked={filters[key]}
              onCheckedChange={(c) => setFilter(key, c === true)}
              className="shrink-0"
            />
            <Label htmlFor={id} className="cursor-pointer p-0.5">
              <span
                className="block h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: hex }}
                aria-hidden
              />
            </Label>
          </div>
        )
      })}
    </div>
  )
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      size="sm"
      className={cn(active && 'ring-1 ring-ring')}
      onClick={onClick}
    >
      {children}
    </Button>
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
  onDeselectAll,
  selectedCount,
  lassoSelectActive,
  onLassoSelectActiveChange,
  onExport,
  onImport,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { hasPendingChanges, saveAllPending } = useClassification()
  const setFilter = (key: keyof FilterState, value: boolean) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const toolbarInner = (idPrefix: string) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Modus:</span>
        <ModeButton active={appMode === 'viewer'} onClick={() => onAppModeChange('viewer')}>
          Viewer
        </ModeButton>
        <ModeButton active={appMode === 'editor'} onClick={() => onAppModeChange('editor')}>
          Editor
        </ModeButton>
        {appMode === 'editor' && hasPendingChanges && (
          <Button type="button" size="sm" onClick={saveAllPending}>
            Speichern
          </Button>
        )}
        {appMode === 'editor' && (
          <Button
            type="button"
            variant={lassoSelectActive ? 'secondary' : 'outline'}
            size="sm"
            className={cn(lassoSelectActive && 'ring-1 ring-ring')}
            title="Mehrere Hausflächen mit einer Freihandform auswählen"
            onClick={() => onLassoSelectActiveChange(!lassoSelectActive)}
          >
            <Spline className="mr-1 inline size-4" aria-hidden />
            Bereich
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Ansicht:</span>
        <ModeButton active={viewMode === '2d'} onClick={() => onViewModeChange('2d')}>
          2D
        </ModeButton>
        <ModeButton active={viewMode === '3d'} onClick={() => onViewModeChange('3d')}>
          3D
        </ModeButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">Filter:</span>
        <ClassificationFilterToggles
          filters={filters}
          setFilter={setFilter}
          idPrefix={idPrefix}
          appMode={appMode}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-uncl`}
            checked={filters.showUnclassified}
            onCheckedChange={(c) => setFilter('showUnclassified', c === true)}
          />
          <Label htmlFor={`${idPrefix}-uncl`} className="flex cursor-pointer items-center gap-1.5 font-normal">
            <span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
            Unklassifiziert
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Darstellung:</span>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-white`}
            checked={whiteMode}
            onCheckedChange={(c) => onWhiteModeChange(c === true)}
          />
          <Label htmlFor={`${idPrefix}-white`} className="cursor-pointer font-normal">
            Weißmodus
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Auswahl:</span>
        {appMode === 'editor' && (
          <span className="text-muted-foreground max-w-[18rem] text-xs">
            {lassoSelectActive
              ? 'Bereich: Auf der Karte zeichnen, loslassen – alle getroffenen Flächen werden ausgewählt. Escape bricht ab.'
              : 'Mehrfachauswahl: Klick hinzufügen, erneut klicken zum Entfernen.'}
          </span>
        )}
        {selectedCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onDeselectAll}>
            Abwählen ({selectedCount})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          Export
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onImport}>
          Import
        </Button>
      </div>
    </>
  )

  return (
    <>
      <div className="bg-card text-card-foreground hidden flex-wrap items-center gap-4 border-b px-3 py-2 text-sm shadow-sm md:flex">
        {toolbarInner('desk')}
      </div>

      <div className="bg-card text-card-foreground border-b md:hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Modus:</span>
            <ModeButton active={appMode === 'viewer'} onClick={() => onAppModeChange('viewer')}>
              Viewer
            </ModeButton>
            <ModeButton active={appMode === 'editor'} onClick={() => onAppModeChange('editor')}>
              Editor
            </ModeButton>
            {appMode === 'editor' && hasPendingChanges && (
              <Button type="button" size="sm" onClick={saveAllPending}>
                Speichern
              </Button>
            )}
            {appMode === 'editor' && (
              <Button
                type="button"
                variant={lassoSelectActive ? 'secondary' : 'outline'}
                size="sm"
                className={cn(lassoSelectActive && 'ring-1 ring-ring')}
                title="Mehrere Hausflächen mit einer Freihandform auswählen"
                onClick={() => onLassoSelectActiveChange(!lassoSelectActive)}
              >
                <Spline className="mr-1 inline size-4" aria-hidden />
                Bereich
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Menü"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">Ansicht:</span>
              <ModeButton active={viewMode === '2d'} onClick={() => onViewModeChange('2d')}>
                2D
              </ModeButton>
              <ModeButton active={viewMode === '3d'} onClick={() => onViewModeChange('3d')}>
                3D
              </ModeButton>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground shrink-0 text-sm">Filter:</span>
              <ClassificationFilterDots
                filters={filters}
                setFilter={setFilter}
                idPrefix="mob"
                appMode={appMode}
              />
              <div className="flex items-center gap-1">
                <Checkbox
                  id="mob-uncl"
                  checked={filters.showUnclassified}
                  onCheckedChange={(c) => setFilter('showUnclassified', c === true)}
                />
                <Label htmlFor="mob-uncl" className="cursor-pointer p-0.5">
                  <span className="block h-3 w-3 rounded-full bg-muted-foreground/60" aria-hidden />
                </Label>
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mob-white"
                  checked={whiteMode}
                  onCheckedChange={(c) => onWhiteModeChange(c === true)}
                />
                <Label htmlFor="mob-white" className="cursor-pointer font-normal">
                  Weißmodus
                </Label>
              </div>
              {appMode === 'editor' && (
                <Button
                  type="button"
                  variant={lassoSelectActive ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => onLassoSelectActiveChange(!lassoSelectActive)}
                >
                  <Spline className="mr-1 inline size-4" aria-hidden />
                  Bereich wählen
                </Button>
              )}
              {selectedCount > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={onDeselectAll}>
                  Abwählen ({selectedCount})
                </Button>
              )}
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onExport}>
                Export
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onImport}>
                Import
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
