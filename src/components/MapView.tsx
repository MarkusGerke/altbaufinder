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
const SELECTION_SOURCE = 'selection-overlay'

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
  const baseColor = CLASSIFICATION_COLORS as maplibregl.ExpressionSpecification
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

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

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
  onBuildingClick?: (building: SelectedBuildingGeo, shiftKey: boolean) => void
  filters: FilterState
  viewMode: '2d' | '3d'
  whiteMode: boolean
  selectedBuildings: SelectedBuildingGeo[]
}

export default function MapView({ onBuildingClick, filters, viewMode, whiteMode, selectedBuildings }: MapViewProps) {
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
          'fill-extrusion-color': whiteModeRef.current ? '#ffffff' : (CLASSIFICATION_COLORS as maplibregl.ExpressionSpecification),
          'fill-extrusion-height': buildExtrusionHeightExpression(filtersRef.current),
          'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0] as maplibregl.ExpressionSpecification,
          'fill-extrusion-opacity': 0.85,
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
        const rawGeometry = f.geometry as GeoJSON.Geometry
        const clickPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        const geometry = extractClickedPolygon(rawGeometry, clickPoint)
        const shiftKey = (e.originalEvent as MouseEvent).shiftKey
        onBuildingClickRef.current?.({ id: stringId, properties: props, geometry }, shiftKey)
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
    const src = map?.getSource(SELECTION_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (selectedBuildings.length === 0) {
      src.setData(EMPTY_FC)
    } else {
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: selectedBuildings.map((b) => ({
          type: 'Feature' as const,
          properties: { id: b.id },
          geometry: b.geometry,
        })),
      }
      src.setData(fc)
    }
  }, [selectedBuildings])

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
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-color', whiteMode ? '#ffffff' : (CLASSIFICATION_COLORS as maplibregl.ExpressionSpecification))
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
