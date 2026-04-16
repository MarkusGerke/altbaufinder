import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useClassification } from '../context/ClassificationContext'
import type { AppMode, ClassificationEntry } from '../types'
import type { FilterState } from './Toolbar'
import { CLASSIFICATION_HEX } from '../classificationLabels'
import { getSunPosition, sunToLightPosition } from '../utils/sunPosition'
import { BERLIN_MAP_MAX_BOUNDS, isLatLngInBerlin } from '@/lib/berlinBounds'
import { geoJsonPolygonCentroid } from '@/utils/geoUtils'

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
  'classification-extrusion',
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

/**
 * Kein `within`-Filter auf den OpenMapTiles-Building-Layern: dort liefern die Kacheln
 * Geometrien, für die `within` praktisch nie erfüllt ist → keine grauen Grundrisse mehr.
 * Berlin-Eingrenzung: maxBounds, Klick-Prüfung, Speichern-API, Klassifikations-Overlay.
 */

/** Mindestens ein Anzeige-Filter aktiv (sonst keine 3D-Gebäude / keine Vektor-Extrusion). */
function hasActiveBuildingFilters(filters: FilterState, appMode: AppMode): boolean {
  if (appMode === 'viewer') {
    return (
      filters.showAltbauGruen ||
      filters.showAltbauGelb ||
      filters.showAltbauRot ||
      filters.showUnclassified
    )
  }
  return (
    filters.showAltbauGruen ||
    filters.showAltbauGelb ||
    filters.showAltbauRot ||
    filters.showKeinAltbau ||
    filters.showUnclassified
  )
}

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
    const centroid = geoJsonPolygonCentroid(entry.geometry)
    if (centroid && !isLatLngInBerlin(centroid.lat, centroid.lng)) continue
    features.push({
      type: 'Feature',
      properties: { id, classification: entry.classification },
      geometry: entry.geometry,
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Nur die Extrusions-Layer vor die Grenz-Linie ziehen (über Bridge-/Gleis-Layern).
 * Fill-/Auswahl-Layer nicht mitverschieben: sonst kann MapLibre 5 bei Pitch die Karte schwarz rendern.
 */
function repositionExtrusionLayersBeforeBoundary(map: maplibregl.Map): void {
  const anchor = map.getLayer('boundary_3')
    ? 'boundary_3'
    : map.getLayer('boundary_2')
      ? 'boundary_2'
      : null
  if (!anchor) return
  for (const id of ['buildings-extrusion', 'classification-extrusion'] as const) {
    if (map.getLayer(id)) map.moveLayer(id, anchor)
  }
}

function syncVectorFeatureStates(
  map: maplibregl.Map,
  classifications: Record<string, ClassificationEntry>,
  prevIdsRef: { current: Set<number> },
): void {
  const current = new Set<number>()
  for (const entry of Object.values(classifications)) {
    if (entry.vectorFeatureId != null) current.add(entry.vectorFeatureId)
  }
  for (const id of prevIdsRef.current) {
    if (!current.has(id)) {
      try {
        map.removeFeatureState({ source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id })
      } catch {
        /* Kacheln evtl. nicht geladen */
      }
    }
  }
  for (const entry of Object.values(classifications)) {
    if (entry.vectorFeatureId != null && entry.classification) {
      try {
        map.setFeatureState(
          { source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: entry.vectorFeatureId },
          { classified: true, cls: entry.classification },
        )
      } catch {
        /* Kacheln evtl. nicht geladen */
      }
    }
  }
  prevIdsRef.current = current
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

/** Geschlossene Ring-Koordinaten [lng, lat] für Treffertests (letzter Punkt = erster). */
function closeLngLatRing(pts: Array<{ lng: number; lat: number }>): [number, number][] {
  if (pts.length < 2) return []
  const first = pts[0]
  const last = pts[pts.length - 1]
  const ring: [number, number][] = pts.map((p) => [p.lng, p.lat])
  if (first.lng !== last.lng || first.lat !== last.lat) {
    ring.push([first.lng, first.lat])
  }
  return ring
}

function dedupeBuildingFeatures(features: maplibregl.GeoJSONFeature[]): maplibregl.GeoJSONFeature[] {
  const seen = new Set<string | number>()
  const out: maplibregl.GeoJSONFeature[] = []
  for (const f of features) {
    if (f.id == null || seen.has(f.id)) continue
    seen.add(f.id)
    out.push(f)
  }
  return out
}

function buildingsFromLasso(
  map: maplibregl.Map,
  lassoLngLat: Array<{ lng: number; lat: number }>,
): SelectedBuildingGeo[] {
  const ring = closeLngLatRing(lassoLngLat)
  if (ring.length < 4) return []

  const projected = ring.map(([lng, lat]) => map.project([lng, lat]))
  const xs = projected.map((p) => p.x)
  const ys = projected.map((p) => p.y)
  const pad = 4
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad

  const raw = map.queryRenderedFeatures(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { layers: ['buildings-fill', 'buildings-extrusion'] },
  )
  const features = dedupeBuildingFeatures(raw as maplibregl.GeoJSONFeature[])
  const out: SelectedBuildingGeo[] = []

  for (const f of features) {
    if (f.id == null) continue
    const stringId = tileIdToStringId(f.id as number)
    const props = (f.properties ?? {}) as Record<string, unknown>
    const rawGeometry = f.geometry as GeoJSON.Geometry
    const c = geoJsonPolygonCentroid(rawGeometry)
    if (!c || !isLatLngInBerlin(c.lat, c.lng)) continue
    const pt: [number, number] = [c.lng, c.lat]
    if (!pointInRing(pt, ring as number[][])) continue
    const geometry = extractClickedPolygon(rawGeometry, pt)
    const c2 = geoJsonPolygonCentroid(geometry)
    if (c2 && !isLatLngInBerlin(c2.lat, c2.lng)) continue
    out.push({
      id: stringId,
      properties: props,
      geometry,
      vectorFeatureId: f.id as number,
    })
  }
  return out
}

export interface SelectedBuildingGeo {
  id: string
  properties: Record<string, unknown>
  geometry: GeoJSON.Geometry
  /** `feature.id` aus der MapLibre-Vektorkachel (für Vektor-Feature-State). */
  vectorFeatureId?: number
}

interface MapViewProps {
  onBuildingClick?: (building: SelectedBuildingGeo) => void
  /** Editor: Freihand-Bereich zeichnen, alle getroffenen Hausflächen zur Auswahl hinzufügen. */
  lassoSelectActive?: boolean
  onLassoSelectBuildings?: (buildings: SelectedBuildingGeo[]) => void
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

interface MapViewPaintInput {
  filters: FilterState
  viewMode: '2d' | '3d'
  whiteMode: boolean
  appMode: AppMode
  /** Anzahl sichtbarer Klassifikations-Features (GeoJSON); 0 → in 3D neutrale Vektor-Würfel zeigen, wenn „Unklassifiziert“ aus ist. */
  classifiedVisibleCount: number
}

/** 2D/3D: Kamera immer setzen; Paint nur wenn Custom-Layer existieren (ohne `isStyleLoaded()` — in MapLibre 5 kann das sonst dauerhaft false bleiben und 3D blockieren). */
function applyMapViewPaint(map: maplibregl.Map, input: MapViewPaintInput): void {
  const { filters, viewMode, whiteMode, appMode, classifiedVisibleCount } = input

  if (viewMode === '3d') {
    map.setPitch(60)
    map.setBearing(30)
  } else {
    map.setPitch(0)
    map.setBearing(0)
  }

  const hasFill = !!map.getLayer('buildings-fill')
  const hasExtr = !!map.getLayer('buildings-extrusion')
  if (!hasFill && !hasExtr) {
    return
  }
  const active = hasActiveBuildingFilters(filters, appMode)
  const baseFill = whiteMode ? '#ffffff' : '#94a3b8'
  const baseOutline = whiteMode ? '#e2e8f0' : '#64748b'
  /** 3D-Extrusion auf weißem Hintergrund sichtbar halten (nicht #fff auf #fff). */
  const extrusionFillColor = whiteMode ? '#64748b' : baseFill
  const showU = filters.showUnclassified
  /** Ohne sichtbare Klassifikations-Polygone sonst komplett leere 3D-Stadt bei showUnclassified=false. */
  const showVectorUnclassified =
    active && (showU || (viewMode === '3d' && classifiedVisibleCount === 0))
  const vecOpac = showVectorUnclassified ? 0.88 : 0

  /** 2D: Unklassifizierte OSM-Grundrisse nur wenn „Unklassifiziert“ aktiv. */
  const fillOpacity2d = showU ? 0.9 : 0

  if (hasFill) {
    map.setPaintProperty('buildings-fill', 'fill-color', baseFill)
    map.setPaintProperty('buildings-fill', 'fill-outline-color', showU ? baseOutline : 'rgba(0,0,0,0)')
    map.setPaintProperty('buildings-fill', 'fill-opacity', viewMode === '2d' ? fillOpacity2d : 0)
    map.setLayoutProperty('buildings-fill', 'visibility', viewMode === '2d' ? 'visible' : 'none')
  }

  const heightExpr: maplibregl.ExpressionSpecification = [
    'max', 8,
    ['coalesce', ['to-number', ['get', 'render_height']], 10],
  ] as unknown as maplibregl.ExpressionSpecification

  /** coalesce: fehlender feature-state darf nicht mit true kollidieren (MapLibre 5). */
  const heightWithClass: maplibregl.ExpressionSpecification = [
    'case',
    ['==', ['coalesce', ['feature-state', 'classified'], false], true],
    0,
    heightExpr,
  ] as unknown as maplibregl.ExpressionSpecification

  const basePaint = ['coalesce', ['to-number', ['get', 'render_min_height']], 0] as maplibregl.ExpressionSpecification

  /**
   * MapLibre 5: fill-extrusion-opacity unterstützt keine Data-Expressions (kein case/feature-state).
   * Log: "fill-extrusion-opacity: data expressions not supported" — deshalb nur Skalar.
   * Klassifizierte Vektor-Flächen: Höhe 0 über heightWithClass, nicht über geteilte Opacity.
   */
  const show3d = viewMode === '3d' && active

  if (hasExtr) {
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-height', heightWithClass)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-base', basePaint)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-color', extrusionFillColor)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-opacity', vecOpac)

    map.setLayoutProperty('buildings-extrusion', 'visibility', show3d ? 'visible' : 'none')
  }
  if (map.getLayer('classification-extrusion')) {
    map.setLayoutProperty('classification-extrusion', 'visibility', show3d ? 'visible' : 'none')
    map.setPaintProperty('classification-extrusion', 'fill-extrusion-color', OVERLAY_FILL_COLOR)
    map.setPaintProperty('classification-extrusion', 'fill-extrusion-opacity', show3d ? 0.88 : 0)
  }

  const overlay2d = viewMode === '2d' ? 'visible' : 'none'
  if (map.getLayer('classification-fill')) {
    map.setLayoutProperty('classification-fill', 'visibility', overlay2d)
  }
  if (map.getLayer('classification-outline')) {
    map.setLayoutProperty('classification-outline', 'visibility', overlay2d)
  }
  if (map.getLayer('selection-fill')) {
    map.setLayoutProperty('selection-fill', 'visibility', overlay2d)
  }
  if (map.getLayer('selection-outline')) {
    map.setLayoutProperty('selection-outline', 'visibility', overlay2d)
  }
}

export default function MapView({
  onBuildingClick,
  lassoSelectActive = false,
  onLassoSelectBuildings,
  filters,
  viewMode,
  whiteMode,
  selectedBuildings,
  appMode,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const lassoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lassoSelectActiveRef = useRef(lassoSelectActive)
  lassoSelectActiveRef.current = lassoSelectActive
  const onLassoSelectRef = useRef(onLassoSelectBuildings)
  onLassoSelectRef.current = onLassoSelectBuildings
  const { classifications } = useClassification()
  const classificationsRef = useRef(classifications)
  classificationsRef.current = classifications
  const classifiedVisibleCount = useMemo(
    () => buildClassificationFC(classifications, filters, appMode).features.length,
    [classifications, filters, appMode],
  )
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const appModeRef = useRef(appMode)
  appModeRef.current = appMode
  const whiteModeRef = useRef(whiteMode)
  whiteModeRef.current = whiteMode
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  const onBuildingClickRef = useRef(onBuildingClick)
  onBuildingClickRef.current = onBuildingClick
  const selectedBuildingsRef = useRef(selectedBuildings)
  selectedBuildingsRef.current = selectedBuildings
  const basemapSnapshotRef = useRef<Map<string, string | undefined> | null>(null)
  const prevVectorFeatureIdsRef = useRef<Set<number>>(new Set())
  const lassoPtsRef = useRef<Array<{ lng: number; lat: number }>>([])
  const lassoDrawingRef = useRef(false)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      interactive: true,
      style: VECTOR_STYLE_URL,
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
      maxBounds: BERLIN_MAP_MAX_BOUNDS,
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

      // Kein feature-state in der Erst-Definition: sonst kann addLayer in MapLibre 5 fehlschlagen —
      // der Handler bricht ab → nur buildings-fill existiert, buildings-extrusion fehlt (Logs: hasExtr:false).
      map.addLayer(
        {
          id: 'buildings-extrusion',
          type: 'fill-extrusion',
          source: VECTOR_SOURCE,
          'source-layer': BUILDING_SOURCE_LAYER,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-color': whiteModeRef.current ? '#64748b' : '#94a3b8',
            'fill-extrusion-height': heightExpr,
            'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0] as maplibregl.ExpressionSpecification,
            'fill-extrusion-opacity': 0,
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

      map.addLayer({
        id: 'classification-extrusion',
        type: 'fill-extrusion',
        source: CLASSIFICATION_SOURCE,
        paint: {
          'fill-extrusion-color': OVERLAY_FILL_COLOR,
          'fill-extrusion-height': 14,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0,
        },
        layout: { visibility: 'none' },
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
        if (lassoSelectActiveRef.current) return
        const f = e.features?.[0]
        if (!f || f.id == null) return
        const clickPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        if (!isLatLngInBerlin(e.lngLat.lat, e.lngLat.lng)) return
        const stringId = tileIdToStringId(f.id as number)
        const props = (f.properties ?? {}) as Record<string, unknown>
        const rawGeometry = f.geometry as GeoJSON.Geometry
        const geometry = extractClickedPolygon(rawGeometry, clickPoint)
        const centroid = geoJsonPolygonCentroid(geometry)
        if (centroid && !isLatLngInBerlin(centroid.lat, centroid.lng)) return
        onBuildingClickRef.current?.({
          id: stringId,
          properties: props,
          geometry,
          vectorFeatureId: f.id != null ? (f.id as number) : undefined,
        })
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

      repositionExtrusionLayersBeforeBoundary(map)
      syncVectorFeatureStates(map, classificationsRef.current, prevVectorFeatureIdsRef)

      applyMapViewPaint(map, {
        filters: filtersRef.current,
        viewMode: viewModeRef.current,
        whiteMode: whiteModeRef.current,
        appMode: appModeRef.current,
        classifiedVisibleCount: buildClassificationFC(
          classificationsRef.current,
          filtersRef.current,
          appModeRef.current,
        ).features.length,
      })

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
    const fc = buildClassificationFC(classifications, filters, appMode)
    src.setData(fc)
  }, [classifications, filters, appMode, viewMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(VECTOR_SOURCE)) return
    syncVectorFeatureStates(map, classifications, prevVectorFeatureIdsRef)
  }, [classifications])

  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource(SELECTION_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(selectionFeatureCollection(selectedBuildings))
  }, [selectedBuildings])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyMapViewPaint(map, {
      filters,
      viewMode,
      whiteMode,
      appMode,
      classifiedVisibleCount,
    })
  }, [filters, viewMode, whiteMode, appMode, classifiedVisibleCount])

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

  useEffect(() => {
    const map = mapRef.current
    const canvas = lassoCanvasRef.current
    if (!map || !canvas || !lassoSelectActive || appMode !== 'editor') {
      return undefined
    }

    const wrap = map.getContainer()

    const syncCanvasSize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    syncCanvasSize()
    map.on('resize', syncCanvasSize)

    const clearCanvas = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width + 2, canvas.height + 2)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const drawPartial = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      clearCanvas()
      const pts = lassoPtsRef.current
      if (pts.length < 1) return
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      const p0 = map.project([pts[0].lng, pts[0].lat])
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < pts.length; i++) {
        const p = map.project([pts[i].lng, pts[i].lat])
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }

    const clientToLngLat = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect()
      return map.unproject([e.clientX - r.left, e.clientY - r.top])
    }

    const shouldAppend = (lng: number, lat: number) => {
      const arr = lassoPtsRef.current
      const last = arr[arr.length - 1]
      if (!last) return true
      const a = map.project([last.lng, last.lat])
      const b = map.project([lng, lat])
      return Math.hypot(a.x - b.x, a.y - b.y) >= 5
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!lassoSelectActiveRef.current || e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const ll = clientToLngLat(e)
      lassoPtsRef.current = [{ lng: ll.lng, lat: ll.lat }]
      lassoDrawingRef.current = true
      map.dragPan.disable()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      drawPartial()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!lassoDrawingRef.current) return
      e.preventDefault()
      const ll = clientToLngLat(e)
      if (shouldAppend(ll.lng, ll.lat)) {
        lassoPtsRef.current.push({ lng: ll.lng, lat: ll.lat })
        drawPartial()
      }
    }

    const finishDraw = (e: PointerEvent) => {
      if (!lassoDrawingRef.current) return
      lassoDrawingRef.current = false
      map.dragPan.enable()
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const pts = lassoPtsRef.current
      lassoPtsRef.current = []
      clearCanvas()
      if (pts.length >= 3) {
        const buildings = buildingsFromLasso(map, pts)
        if (buildings.length > 0) {
          onLassoSelectRef.current?.(buildings)
        }
      }
    }

    const onPointerCancel = (e: PointerEvent) => {
      if (!lassoDrawingRef.current) return
      lassoDrawingRef.current = false
      map.dragPan.enable()
      lassoPtsRef.current = []
      clearCanvas()
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false })
    canvas.addEventListener('pointermove', onPointerMove, { passive: false })
    canvas.addEventListener('pointerup', finishDraw)
    canvas.addEventListener('pointercancel', onPointerCancel)

    return () => {
      map.off('resize', syncCanvasSize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', finishDraw)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      map.dragPan.enable()
      lassoDrawingRef.current = false
      lassoPtsRef.current = []
      clearCanvas()
    }
  }, [lassoSelectActive, appMode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !lassoDrawingRef.current) return
      const map = mapRef.current
      const canvas = lassoCanvasRef.current
      lassoDrawingRef.current = false
      lassoPtsRef.current = []
      map?.dragPan.enable()
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1)
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, canvas.width + 2, canvas.height + 2)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" aria-label="Karte Berlin" />
      <canvas
        ref={lassoCanvasRef}
        aria-hidden
        className={lassoSelectActive && appMode === 'editor' ? 'pointer-events-auto touch-none absolute inset-0 z-[4] cursor-crosshair' : 'pointer-events-none absolute inset-0 z-[4]'}
      />
    </div>
  )
}
