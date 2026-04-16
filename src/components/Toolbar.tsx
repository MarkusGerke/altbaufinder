import { useState, type ReactNode } from 'react'
import { ChevronDown, Menu, Spline } from 'lucide-react'
import type { AppMode } from '../types'
import type { BuildingClassification } from '../types'
import { useClassification } from '../context/ClassificationContext'
import {
  CLASSIFICATION_HEX,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
  CLASSIFICATION_ORDER_WITH_KEIN,
} from '../classificationLabels'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  onDeselectAll: () => void
  selectedCount: number
  lassoSelectActive: boolean
  onLassoSelectActiveChange: (active: boolean) => void
}

function classificationOrderForMode(appMode: AppMode) {
  return appMode === 'editor' ? CLASSIFICATION_ORDER_WITH_KEIN : CLASSIFICATION_ORDER
}

/** „Alle“ = alle Klassen der aktuellen Ansicht plus Unklassifiziert aktiv. */
function isAllSelected(filters: FilterState, appMode: AppMode): boolean {
  if (!filters.showUnclassified) return false
  for (const cls of classificationOrderForMode(appMode)) {
    if (!filters[FILTER_KEY[cls]]) return false
  }
  return true
}

function setAllFilters(on: boolean, appMode: AppMode): FilterState {
  if (appMode === 'viewer') {
    return {
      showAltbauGruen: on,
      showAltbauGelb: on,
      showAltbauRot: on,
      showKeinAltbau: false,
      showUnclassified: on,
    }
  }
  return {
    showAltbauGruen: on,
    showAltbauGelb: on,
    showAltbauRot: on,
    showKeinAltbau: on,
    showUnclassified: on,
  }
}

function ClassificationFilterDropdown({
  filters,
  onFiltersChange,
  appMode,
}: {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  appMode: AppMode
}) {
  const order = classificationOrderForMode(appMode)
  const setFilter = (key: keyof FilterState, value: boolean) => {
    onFiltersChange({ ...filters, [key]: value })
  }
  const allOn = isAllSelected(filters, appMode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          Klassifizierung
          <ChevronDown className="size-4 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Einblendung</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={allOn}
          onCheckedChange={(c) => onFiltersChange(setAllFilters(c === true, appMode))}
        >
          Alle
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {order.map((cls) => {
          const key = FILTER_KEY[cls]
          const hex = CLASSIFICATION_HEX[cls]
          return (
            <DropdownMenuCheckboxItem
              key={cls}
              checked={filters[key]}
              onCheckedChange={(c) => setFilter(key, c === true)}
            >
              <span
                className="inline-block size-2.5 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: hex }}
                aria-hidden
              />
              <span className="min-w-0">{CLASSIFICATION_LABELS[cls]}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filters.showUnclassified}
          onCheckedChange={(c) => setFilter('showUnclassified', c === true)}
        >
          <span
            className="inline-block size-2.5 shrink-0 rounded-full bg-muted-foreground/60"
            aria-hidden
          />
          Unklassifiziert
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  onDeselectAll,
  selectedCount,
  lassoSelectActive,
  onLassoSelectActiveChange,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { hasPendingChanges, saveAllPending } = useClassification()

  const toolbarInner = (
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
        <ClassificationFilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
          appMode={appMode}
        />
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
    </>
  )

  return (
    <>
      <div className="bg-card text-card-foreground hidden flex-wrap items-center gap-4 border-b px-3 py-2 text-sm shadow-sm md:flex">
        {toolbarInner}
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
              <ClassificationFilterDropdown
                filters={filters}
                onFiltersChange={onFiltersChange}
                appMode={appMode}
              />
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-3">
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
