import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useClassification } from '../context/ClassificationContext'
import type { AppMode, ClassificationEntry } from '../types'
import type { FilterState } from './Toolbar'
import { CLASSIFICATION_HEX } from '../classificationLabels'
import { getSunPosition, sunToLightPosition } from '../utils/sunPosition'

const BERLIN_CENTER: [number, number] = [13.404954, 52.520008]
const DEFAULT_ZOOM = 15

const GEO_SESSION_DISMISS_KEY = 'altbaufinder-geolocate-dismissed'

function isMobileGeolocateContext(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(max-width: 767px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

function geolocateAnchor(): maplibregl.ControlPosition {
  return isMobileGeolocateContext() ? 'bottom-right' : 'top-right'
}

/** iPhone / iPad (inkl. iPadOS „Macintosh“ mit Touch) – Safari neigt zu Timeouts bei High-Accuracy + watchPosition. */
function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Für iOS: schnellere Fix über WLAN/Funkzellen; kein erzwungenes GPS. */
function geolocatePositionOptions(): PositionOptions {
  if (isAppleTouchDevice() || isMobileGeolocateContext()) {
    return {
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 30_000,
    }
  }
  return {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15_000,
  }
}

const VECTOR_SOURCE = 'openmaptiles'
const BUILDING_SOURCE_LAYER = 'building'
const SELECTION_SOURCE = 'selection-overlay'
const CLASSIFICATION_SOURCE = 'classification-overlay'

/** OpenFreeMap Liberty (Vektor-Basemap, gleiche `openmaptiles`-Quelle wie unsere Gebäude-Layer). */
const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

const CUSTOM_MAP_LAYER_IDS = new Set([
  'buildings-fill',
  'buildings-extrusion',
  'classification-fill',
  'classification-outline',
  'selection-fill',
  'selection-outline',
])

/** Im Viewer: POI-Schichten und Fußweg-Beschriftung ausblenden (Orientierung: Straßen, Orte, Gewässer). */
const SYMBOL_LAYERS_HIDDEN_IN_VIEWER = new Set([
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
  'airport',
  'highway-name-path',
])

const LIBERTY_BACKGROUND = '#f8f4f0'

function firstSymbolLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
}

function hideDuplicateStyleBuildings(map: maplibregl.Map): void {
  for (const id of ['building', 'building-3d']) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', 'none')
    }
  }
}

function snapshotBasemapVisibility(map: maplibregl.Map): Map<string, string | undefined> {
  const snap = new Map<string, string | undefined>()
  for (const layer of map.getStyle().layers ?? []) {
    if (CUSTOM_MAP_LAYER_IDS.has(layer.id)) continue
    try {
      snap.set(layer.id, map.getLayoutProperty(layer.id, 'visibility') as string | undefined)
    } catch {
      snap.set(layer.id, undefined)
    }
  }
  return snap
}

function applyViewerSymbolFilter(map: maplibregl.Map, mode: AppMode): void {
  const vis = mode === 'viewer' ? 'none' : 'visible'
  for (const id of SYMBOL_LAYERS_HIDDEN_IN_VIEWER) {
    if (!map.getLayer(id)) continue
    map.setLayoutProperty(id, 'visibility', vis)
  }
}

function applyWhiteBasemap(
  map: maplibregl.Map,
  white: boolean,
  snapshot: Map<string, string | undefined>
): void {
  if (white) {
    for (const layer of map.getStyle().layers ?? []) {
      if (CUSTOM_MAP_LAYER_IDS.has(layer.id)) continue
      if (layer.id === 'background') {
        map.setPaintProperty('background', 'background-color', '#ffffff')
        continue
      }
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    }
    return
  }
  for (const [id, prev] of snapshot) {
    if (!map.getLayer(id)) continue
    const v = prev === 'none' ? 'none' : 'visible'
    try {
      map.setLayoutProperty(id, 'visibility', v)
    } catch {
      /* ignore */
    }
  }
  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-color', LIBERTY_BACKGROUND)
  }
  hideDuplicateStyleBuildings(map)
}

function tileIdToStringId(tileId: number): string {
  const typeCode = tileId % 10
  const osmId = Math.floor(tileId / 10)
  const prefix = typeCode === 3 ? 'rel' : 'way'
  return `${prefix}-${osmId}`
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function classificationVisible(
  c: ClassificationEntry['classification'],
  filters: FilterState,
  appMode: AppMode
): boolean {
  if (!c) return false
  if (c === 'kein_altbau') {
    if (appMode === 'viewer') return false
    return filters.showKeinAltbau
  }
  switch (c) {
    case 'altbau_gruen':
      return filters.showAltbauGruen
    case 'altbau_gelb':
      return filters.showAltbauGelb
    case 'altbau_rot':
      return filters.showAltbauRot
    default:
      return false
  }
}

function buildClassificationFC(
  classifications: Record<string, ClassificationEntry>,
  filters: FilterState,
  appMode: AppMode
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const [id, entry] of Object.entries(classifications)) {
    if (!entry.classification || !entry.geometry) continue
    if (!classificationVisible(entry.classification, filters, appMode)) continue
    features.push({
      type: 'Feature',
      properties: { id, classification: entry.classification },
      geometry: entry.geometry,
    })
  }
  return { type: 'FeatureCollection', features }
}

const OVERLAY_FILL_COLOR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'classification'],
  'altbau_gruen',
  CLASSIFICATION_HEX.altbau_gruen,
  'altbau_gelb',
  CLASSIFICATION_HEX.altbau_gelb,
  'altbau_rot',
  CLASSIFICATION_HEX.altbau_rot,
  'kein_altbau',
  CLASSIFICATION_HEX.kein_altbau,
  '#94a3b8',
] as unknown as maplibregl.ExpressionSpecification

function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function extractClickedPolygon(
  geometry: GeoJSON.Geometry,
  clickLngLat: [number, number]
): GeoJSON.Geometry {
  if (geometry.type === 'MultiPolygon') {
    for (const polyCoords of geometry.coordinates) {
      if (polyCoords[0] && pointInRing(clickLngLat, polyCoords[0])) {
        return { type: 'Polygon', coordinates: polyCoords }
      }
    }
  }
  return geometry
}

export interface SelectedBuildingGeo {
  id: string
  properties: Record<string, unknown>
  geometry: GeoJSON.Geometry
}

interface MapViewProps {
  onBuildingClick?: (building: SelectedBuildingGeo) => void
  filters: FilterState
  viewMode: '2d' | '3d'
  whiteMode: boolean
  selectedBuildings: SelectedBuildingGeo[]
  appMode: AppMode
}

function selectionFeatureCollection(selected: SelectedBuildingGeo[]): GeoJSON.FeatureCollection {
  if (selected.length === 0) return EMPTY_FC
  return {
    type: 'FeatureCollection',
    features: selected.map((b) => ({
      type: 'Feature' as const,
      properties: { id: b.id },
      geometry: b.geometry,
    })),
  }
}

export default function MapView({
  onBuildingClick,
  filters,
  viewMode,
  whiteMode,
  selectedBuildings,
  appMode,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const { classifications } = useClassification()
  const classificationsRef = useRef(classifications)
  classificationsRef.current = classifications
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const appModeRef = useRef(appMode)
  appModeRef.current = appMode
  const whiteModeRef = useRef(whiteMode)
  whiteModeRef.current = whiteMode
  const onBuildingClickRef = useRef(onBuildingClick)
  onBuildingClickRef.current = onBuildingClick
  const selectedBuildingsRef = useRef(selectedBuildings)
  selectedBuildingsRef.current = selectedBuildings
  const basemapSnapshotRef = useRef<Map<string, string | undefined> | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      interactive: true,
      style: VECTOR_STYLE_URL,
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: geolocatePositionOptions(),
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserLocation: true,
      fitBoundsOptions: {
        maxZoom: 17,
        padding: isMobileGeolocateContext()
          ? { top: 56, bottom: 100, left: 20, right: 20 }
          : { top: 40, bottom: 40, left: 40, right: 40 },
      },
    })
    map.addControl(geolocate, geolocateAnchor())

    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('load', () => {
      hideDuplicateStyleBuildings(map)

      const beforeSymbols = firstSymbolLayerId(map)

      const { azimuthDeg, elevationDeg } = getSunPosition(52.52, 13.405, new Date())
      map.setLight({
        anchor: 'map',
        position: sunToLightPosition(azimuthDeg, elevationDeg),
        color: '#ffffff',
        intensity: 0.6,
      } as maplibregl.LightSpecification)

      const baseFill = whiteModeRef.current ? '#ffffff' : '#94a3b8'
      const baseOutline = whiteModeRef.current ? '#e2e8f0' : '#64748b'
      const showUnclassifiedBase = filtersRef.current.showUnclassified
      const baseFillOpacity = showUnclassifiedBase ? 0.9 : 0
      const baseOutlinePaint = showUnclassifiedBase ? baseOutline : 'rgba(0,0,0,0)'

      map.addLayer(
        {
          id: 'buildings-fill',
          type: 'fill',
          source: VECTOR_SOURCE,
          'source-layer': BUILDING_SOURCE_LAYER,
          minzoom: 14,
          paint: {
            'fill-color': baseFill,
            'fill-opacity': baseFillOpacity,
            'fill-outline-color': baseOutlinePaint,
          },
        },
        beforeSymbols
      )

      const heightExpr: maplibregl.ExpressionSpecification = [
        'max', 8,
        ['coalesce', ['to-number', ['get', 'render_height']], 10],
      ] as unknown as maplibregl.ExpressionSpecification

      map.addLayer(
        {
          id: 'buildings-extrusion',
          type: 'fill-extrusion',
          source: VECTOR_SOURCE,
          'source-layer': BUILDING_SOURCE_LAYER,
          minzoom: 14,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-color': whiteModeRef.current ? '#ffffff' : '#94a3b8',
            'fill-extrusion-height': heightExpr,
            'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0] as maplibregl.ExpressionSpecification,
            // Unklassifizierte Flächen (buildings-fill) steuern nur 2D; 3D-Extrusion immer sichtbar in 3D-Ansicht
            'fill-extrusion-opacity': 0.88,
          },
          layout: { visibility: 'none' },
        },
        beforeSymbols
      )

      map.addSource(CLASSIFICATION_SOURCE, { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'classification-fill',
        type: 'fill',
        source: CLASSIFICATION_SOURCE,
        paint: {
          'fill-color': OVERLAY_FILL_COLOR,
          'fill-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'classification-outline',
        type: 'line',
        source: CLASSIFICATION_SOURCE,
        paint: {
          'line-color': '#64748b',
          'line-width': 1,
        },
      })

      map.addSource(SELECTION_SOURCE, { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'selection-fill',
        type: 'fill',
        source: SELECTION_SOURCE,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.35,
        },
      })
      map.addLayer({
        id: 'selection-outline',
        type: 'line',
        source: SELECTION_SOURCE,
        paint: {
          'line-color': '#2563eb',
          'line-width': 2.5,
        },
      })

      basemapSnapshotRef.current = snapshotBasemapVisibility(map)
      if (whiteModeRef.current) {
        applyWhiteBasemap(map, true, basemapSnapshotRef.current)
      } else {
        applyViewerSymbolFilter(map, appModeRef.current)
      }

      const handleClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0]
        if (!f || f.id == null) return
        const stringId = tileIdToStringId(f.id as number)
        const props = (f.properties ?? {}) as Record<string, unknown>
        const rawGeometry = f.geometry as GeoJSON.Geometry
        const clickPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        const geometry = extractClickedPolygon(rawGeometry, clickPoint)
        onBuildingClickRef.current?.({ id: stringId, properties: props, geometry })
      }
      map.on('click', 'buildings-fill', handleClick)
      map.on('click', 'buildings-extrusion', handleClick)
      map.getCanvas().style.cursor = 'default'
      map.on('mouseenter', 'buildings-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'buildings-fill', () => { map.getCanvas().style.cursor = 'default' })
      map.on('mouseenter', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'default' })

      // API kann Klassifizierungen liefern, bevor dieser Handler lief — der React-Effekt sieht die Quelle noch nicht.
      // Einmal synchron anwenden, sobald Quellen existieren.
      const clsSrc = map.getSource(CLASSIFICATION_SOURCE) as maplibregl.GeoJSONSource
      clsSrc.setData(
        buildClassificationFC(classificationsRef.current, filtersRef.current, appModeRef.current)
      )
      const selSrc = map.getSource(SELECTION_SOURCE) as maplibregl.GeoJSONSource
      selSrc.setData(selectionFeatureCollection(selectedBuildingsRef.current))

      // iOS/iPadOS: programmatisches trigger() ohne Nutzeraktion liefert oft Fehler → Control bleibt „durchgestrichen“.
      const shouldAutoGeolocate =
        isMobileGeolocateContext() &&
        !isAppleTouchDevice() &&
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(GEO_SESSION_DISMISS_KEY) !== '1'

      if (shouldAutoGeolocate) {
        const onGeoError = () => {
          try {
            sessionStorage.setItem(GEO_SESSION_DISMISS_KEY, '1')
          } catch { /* private mode */ }
          geolocate.off('error', onGeoError)
        }
        geolocate.on('error', onGeoError)
        geolocate.once('geolocate', () => {
          geolocate.off('error', onGeoError)
        })
        requestAnimationFrame(() => {
          try {
            geolocate.trigger()
          } catch {
            onGeoError()
          }
        })
      }
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource(CLASSIFICATION_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(buildClassificationFC(classifications, filters, appMode))
  }, [classifications, filters, appMode])

  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource(SELECTION_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(selectionFeatureCollection(selectedBuildings))
  }, [selectedBuildings])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('buildings-fill')) return
    const baseFill = whiteMode ? '#ffffff' : '#94a3b8'
    const baseOutline = whiteMode ? '#e2e8f0' : '#64748b'
    const showU = filters.showUnclassified
    map.setPaintProperty('buildings-fill', 'fill-color', baseFill)
    map.setPaintProperty('buildings-fill', 'fill-outline-color', showU ? baseOutline : 'rgba(0,0,0,0)')
    map.setPaintProperty('buildings-fill', 'fill-opacity', showU ? 0.9 : 0)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-color', whiteMode ? '#ffffff' : '#94a3b8')
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-opacity', viewMode === '3d' ? 0.88 : 0)
    map.setLayoutProperty('buildings-fill', 'visibility', viewMode === '2d' ? 'visible' : 'none')
    map.setLayoutProperty('buildings-extrusion', 'visibility', viewMode === '3d' ? 'visible' : 'none')
    if (viewMode === '3d') {
      map.setPitch(60)
      map.setBearing(30)
    } else {
      map.setPitch(0)
      map.setBearing(0)
    }
  }, [filters, viewMode, whiteMode])

  useEffect(() => {
    const map = mapRef.current
    const snap = basemapSnapshotRef.current
    if (!map?.getLayer('buildings-fill') || !snap) return
    if (whiteMode) {
      applyWhiteBasemap(map, true, snap)
    } else {
      applyWhiteBasemap(map, false, snap)
      hideDuplicateStyleBuildings(map)
      applyViewerSymbolFilter(map, appMode)
    }
  }, [whiteMode, appMode])

  return (
    <div ref={mapContainerRef} className="w-full h-full" aria-label="Karte Berlin" />
  )
}
