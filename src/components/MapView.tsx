import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useClassification } from '../context/ClassificationContext'
import type { FilterState } from './Toolbar'
import { getSunPosition, sunToLightPosition } from '../utils/sunPosition'

const BERLIN_CENTER: [number, number] = [13.404954, 52.520008]
const DEFAULT_ZOOM = 15

const VECTOR_SOURCE = 'openmaptiles'
const BUILDING_SOURCE_LAYER = 'building'

/**
 * OpenFreeMap/Planetiler encodes feature IDs as `osm_id * 10 + type`
 * where type: 1=node, 2=way, 3=relation.
 * We convert to a stable string ID for classification storage.
 */
function tileIdToStringId(tileId: number): string {
  const typeCode = tileId % 10
  const osmId = Math.floor(tileId / 10)
  const prefix = typeCode === 3 ? 'rel' : 'way'
  return `${prefix}-${osmId}`
}

function stringIdToTileId(stringId: string): number | null {
  const m = stringId.match(/^(way|rel)-(\d+)$/)
  if (!m) return null
  const typeCode = m[1] === 'rel' ? 3 : 2
  return Number(m[2]) * 10 + typeCode
}

const CLASSIFICATION_COLORS: unknown = [
  'match',
  ['coalesce', ['feature-state', 'classification'], 'unclassified'],
  'original', '#22c55e',
  'altbau_entstuckt', '#eab308',
  'kein_altbau', '#ef4444',
  'unclassified', '#94a3b8',
  '#94a3b8',
]

const SELECTED_COLORS: unknown = [
  'match',
  ['coalesce', ['feature-state', 'classification'], 'unclassified'],
  'original', '#15803d',
  'altbau_entstuckt', '#a16207',
  'kein_altbau', '#b91c1c',
  'unclassified', '#475569',
  '#475569',
]

const FILL_COLOR_WITH_SELECTION: unknown = [
  'case',
  ['==', ['feature-state', 'selected'], true],
  SELECTED_COLORS,
  CLASSIFICATION_COLORS,
]

const HEIGHT_EXPRESSION: unknown = [
  'max', 8,
  ['coalesce', ['to-number', ['get', 'render_height']], 10],
]

function buildFillColorExpression(filters: FilterState): maplibregl.ExpressionSpecification {
  const stateClass = ['coalesce', ['feature-state', 'classification'], 'unclassified'] as maplibregl.ExpressionSpecification
  const conditions: maplibregl.ExpressionSpecification[] = []
  if (filters.showGreen) conditions.push(['==', stateClass, 'original'])
  if (filters.showYellow) conditions.push(['==', stateClass, 'altbau_entstuckt'])
  if (filters.showRed) conditions.push(['==', stateClass, 'kein_altbau'])
  if (filters.showUnclassified) conditions.push(['==', stateClass, 'unclassified'])
  if (conditions.length === 0) return 'rgba(0,0,0,0)' as unknown as maplibregl.ExpressionSpecification
  const baseColor = FILL_COLOR_WITH_SELECTION as maplibregl.ExpressionSpecification
  if (conditions.length === 1) {
    return ['case', conditions[0], baseColor, 'rgba(0,0,0,0)'] as unknown as maplibregl.ExpressionSpecification
  }
  return ['case', ['any', ...conditions], baseColor, 'rgba(0,0,0,0)'] as unknown as maplibregl.ExpressionSpecification
}

function buildOutlineColorExpression(filters: FilterState): maplibregl.ExpressionSpecification {
  const stateClass = ['coalesce', ['feature-state', 'classification'], 'unclassified'] as maplibregl.ExpressionSpecification
  const conditions: maplibregl.ExpressionSpecification[] = []
  if (filters.showGreen) conditions.push(['==', stateClass, 'original'])
  if (filters.showYellow) conditions.push(['==', stateClass, 'altbau_entstuckt'])
  if (filters.showRed) conditions.push(['==', stateClass, 'kein_altbau'])
  if (filters.showUnclassified) conditions.push(['==', stateClass, 'unclassified'])
  if (conditions.length === 0) return 'rgba(0,0,0,0)' as unknown as maplibregl.ExpressionSpecification
  const outlineColor = '#64748b' as unknown as maplibregl.ExpressionSpecification
  if (conditions.length === 1) {
    return ['case', conditions[0], outlineColor, 'rgba(0,0,0,0)'] as unknown as maplibregl.ExpressionSpecification
  }
  return ['case', ['any', ...conditions], outlineColor, 'rgba(0,0,0,0)'] as unknown as maplibregl.ExpressionSpecification
}

function buildExtrusionHeightExpression(filters: FilterState): maplibregl.ExpressionSpecification {
  const stateClass = ['coalesce', ['feature-state', 'classification'], 'unclassified'] as maplibregl.ExpressionSpecification
  const conditions: maplibregl.ExpressionSpecification[] = []
  if (filters.showGreen) conditions.push(['==', stateClass, 'original'])
  if (filters.showYellow) conditions.push(['==', stateClass, 'altbau_entstuckt'])
  if (filters.showRed) conditions.push(['==', stateClass, 'kein_altbau'])
  if (filters.showUnclassified) conditions.push(['==', stateClass, 'unclassified'])
  if (conditions.length === 0) return 0 as unknown as maplibregl.ExpressionSpecification
  const baseHeight = HEIGHT_EXPRESSION as maplibregl.ExpressionSpecification
  if (conditions.length === 1) {
    return ['case', conditions[0], baseHeight, 0] as unknown as maplibregl.ExpressionSpecification
  }
  return ['case', ['any', ...conditions], baseHeight, 0] as unknown as maplibregl.ExpressionSpecification
}

function applyClassificationStates(
  map: maplibregl.Map,
  classifications: Record<string, { classification: string | null; lastModified: number }>
) {
  for (const [stringId, entry] of Object.entries(classifications)) {
    const tileId = stringIdToTileId(stringId)
    if (tileId == null) continue
    try {
      if (entry.classification !== null) {
        map.setFeatureState(
          { source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: tileId },
          { classification: entry.classification }
        )
      } else {
        map.removeFeatureState(
          { source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: tileId }
        )
      }
    } catch {
      // tile not loaded yet
    }
  }
}

interface MapViewProps {
  onBuildingClick?: (id: string, properties: Record<string, unknown>, lngLat: [number, number], shiftKey: boolean) => void
  filters: FilterState
  viewMode: '2d' | '3d'
  whiteMode: boolean
  selectedBuildingIds: string[]
}

export default function MapView({ onBuildingClick, filters, viewMode, whiteMode, selectedBuildingIds }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const { classifications, registerRemoveFeatureState } = useClassification()
  const classificationsRef = useRef(classifications)
  classificationsRef.current = classifications
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const whiteModeRef = useRef(whiteMode)
  whiteModeRef.current = whiteMode
  const onBuildingClickRef = useRef(onBuildingClick)
  onBuildingClickRef.current = onBuildingClick
  const prevSelectedIdsRef = useRef<string[]>([])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      interactive: true,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#ffffff' },
          },
          {
            id: 'osm-tiles-layer',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('load', () => {
      map.addSource(VECTOR_SOURCE, {
        url: 'https://tiles.openfreemap.org/planet',
        type: 'vector',
      })

      const { azimuthDeg, elevationDeg } = getSunPosition(52.52, 13.405, new Date())
      map.setLight({
        anchor: 'map',
        position: sunToLightPosition(azimuthDeg, elevationDeg),
        color: '#ffffff',
        intensity: 0.6,
      } as maplibregl.LightSpecification)

      map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': BUILDING_SOURCE_LAYER,
        minzoom: 14,
        paint: {
          'fill-color': whiteModeRef.current ? '#ffffff' : buildFillColorExpression(filtersRef.current),
          'fill-opacity': 0.9,
          'fill-outline-color': whiteModeRef.current ? '#e2e8f0' : buildOutlineColorExpression(filtersRef.current),
        },
      })

      map.addLayer({
        id: 'buildings-extrusion',
        type: 'fill-extrusion',
        source: VECTOR_SOURCE,
        'source-layer': BUILDING_SOURCE_LAYER,
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': whiteModeRef.current ? '#ffffff' : (FILL_COLOR_WITH_SELECTION as maplibregl.ExpressionSpecification),
          'fill-extrusion-height': buildExtrusionHeightExpression(filtersRef.current),
          'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0] as maplibregl.ExpressionSpecification,
          'fill-extrusion-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      })

      map.on('sourcedata', (e) => {
        if (e.sourceId === VECTOR_SOURCE && e.isSourceLoaded) {
          applyClassificationStates(map, classificationsRef.current)
        }
      })

      registerRemoveFeatureState((stringId) => {
        const tileId = stringIdToTileId(stringId)
        if (tileId == null) return
        try {
          map.removeFeatureState({ source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: tileId })
        } catch { /* ignore */ }
      })

      const handleClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0]
        if (!f || f.id == null) return
        const stringId = tileIdToStringId(f.id as number)
        const props = (f.properties ?? {}) as Record<string, unknown>
        const shiftKey = (e.originalEvent as MouseEvent).shiftKey
        onBuildingClickRef.current?.(stringId, props, [e.lngLat.lng, e.lngLat.lat], shiftKey)
      }
      map.on('click', 'buildings-fill', handleClick)
      map.on('click', 'buildings-extrusion', handleClick)
      map.getCanvas().style.cursor = 'default'
      map.on('mouseenter', 'buildings-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'buildings-fill', () => { map.getCanvas().style.cursor = 'default' })
      map.on('mouseenter', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'default' })
    })

    mapRef.current = map
    return () => {
      registerRemoveFeatureState(null)
      map.remove()
      mapRef.current = null
    }
  }, [registerRemoveFeatureState])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(VECTOR_SOURCE)) return
    applyClassificationStates(map, classifications)
  }, [classifications])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(VECTOR_SOURCE)) return
    const prevIds = prevSelectedIdsRef.current
    prevSelectedIdsRef.current = selectedBuildingIds
    try {
      for (const sid of prevIds) {
        const tid = stringIdToTileId(sid)
        if (tid != null) map.setFeatureState({ source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: tid }, { selected: false })
      }
      for (const sid of selectedBuildingIds) {
        const tid = stringIdToTileId(sid)
        if (tid != null) map.setFeatureState({ source: VECTOR_SOURCE, sourceLayer: BUILDING_SOURCE_LAYER, id: tid }, { selected: true })
      }
    } catch {
      // tile not loaded
    }
  }, [selectedBuildingIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('buildings-fill')) return
    const fillColor2D = buildFillColorExpression(filters)
    const outlineColor2D = buildOutlineColorExpression(filters)
    const extrusionHeight3D = buildExtrusionHeightExpression(filters)
    map.setPaintProperty('buildings-fill', 'fill-color', whiteMode ? '#ffffff' : fillColor2D)
    map.setPaintProperty('buildings-fill', 'fill-outline-color', whiteMode ? '#e2e8f0' : outlineColor2D)
    map.setPaintProperty('buildings-fill', 'fill-opacity', 0.9)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-height', extrusionHeight3D)
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-color', whiteMode ? '#ffffff' : (FILL_COLOR_WITH_SELECTION as maplibregl.ExpressionSpecification))
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
    if (!map?.getLayer('osm-tiles-layer')) return
    map.setLayoutProperty('osm-tiles-layer', 'visibility', whiteMode ? 'none' : 'visible')
  }, [whiteMode])

  return (
    <div ref={mapContainerRef} className="w-full h-full" aria-label="Karte Berlin" />
  )
}
