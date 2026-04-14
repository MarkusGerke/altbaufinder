import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useClassification } from '../context/ClassificationContext'
import type { FilterState } from './Toolbar'
import { getSunPosition, sunToLightPosition } from '../utils/sunPosition'

interface GeoJSONFeature {
  type: string
  id?: string | number
  properties?: Record<string, unknown>
  geometry: unknown
}
interface GeoJSONFC {
  type: string
  features: GeoJSONFeature[]
}

function normalizeGeoJSON(geojson: GeoJSONFC): void {
  if (!geojson.features) return
  for (const f of geojson.features) {
    if (!f.properties) f.properties = {}
    if (f.properties.id == null && f.id != null) f.properties.id = String(f.id)
  }
}

const BERLIN_MITTE: [number, number] = [13.404954, 52.520008]
const DEFAULT_ZOOM = 15
const BUILDINGS_GEOJSON_URL = '/data/berlin_mitte_buildings.geojson'

function forEachOuterRing(
  geometry: { type: string; coordinates?: unknown },
  cb: (ring: number[][]) => void
): void {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][]
    if (coords?.[0]) cb(coords[0])
  } else if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][]
    for (const poly of polys ?? []) {
      if (poly?.[0]) cb(poly[0])
    }
  }
}

function getBoundsFromGeoJSON(geojson: GeoJSONFC): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const f of geojson.features ?? []) {
    const g = f.geometry as { type: string; coordinates?: unknown }
    forEachOuterRing(g, (ring) => {
      for (const [lng, lat] of ring) {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
      }
    })
  }
  if (minLng === Infinity) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

/** GeoJSON-Schatten: Gebäudegrundrisse in Sonnenrichtung versetzt. */
function buildShadowGeoJSON(
  geojson: GeoJSONFC,
  centerLat: number,
  azimuthDeg: number,
  elevationDeg: number
): GeoJSON.FeatureCollection {
  const elevationRad = (Math.max(2, elevationDeg) * Math.PI) / 180
  const azimuthRad = (azimuthDeg * Math.PI) / 180
  const latRad = (centerLat * Math.PI) / 180
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(latRad)
  const shadowLength = Math.min(40, Math.max(6, 14 / Math.tan(elevationRad)))
  const dxM = -shadowLength * Math.sin(azimuthRad)
  const dyM = -shadowLength * Math.cos(azimuthRad)
  const offsetLng = dxM / metersPerDegLng
  const offsetLat = dyM / metersPerDegLat

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (const f of geojson.features ?? []) {
    const g = f.geometry as { type: string; coordinates?: unknown }
    forEachOuterRing(g, (ring) => {
      const shifted = ring.map(([lng, lat]) => [lng + offsetLng, lat + offsetLat] as [number, number])
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [shifted] },
      })
    })
  }
  return { type: 'FeatureCollection', features }
}

const CLASSIFICATION_COLORS: unknown = [
  'match',
  ['coalesce', ['feature-state', 'classification'], 'unclassified'],
  'original',
  '#22c55e',
  'altbau_entstuckt',
  '#eab308',
  'kein_altbau',
  '#ef4444',
  'unclassified',
  '#94a3b8',
  '#94a3b8',
]

const SELECTED_COLORS: unknown = [
  'match',
  ['coalesce', ['feature-state', 'classification'], 'unclassified'],
  'original',
  '#15803d',
  'altbau_entstuckt',
  '#a16207',
  'kein_altbau',
  '#b91c1c',
  'unclassified',
  '#475569',
  '#475569',
]

const FILL_COLOR_WITH_SELECTION: unknown = [
  'case',
  ['==', ['feature-state', 'selected'], true],
  SELECTED_COLORS,
  CLASSIFICATION_COLORS,
]

const HEIGHT_EXPRESSION: unknown = [
  'max',
  8,
  [
    'coalesce',
    ['to-number', ['get', 'height']],
    ['*', ['coalesce', ['to-number', ['get', 'building:levels']], 3], 3],
    10,
  ],
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

function applyFeatureState(
  map: maplibregl.Map,
  classifications: Record<string, { classification: string | null; lastModified: number }>
) {
  const source = map.getSource('buildings')
  if (!source || source.type !== 'geojson') return
  for (const [id, entry] of Object.entries(classifications)) {
    try {
      if (entry.classification !== null) {
        map.setFeatureState({ source: 'buildings', id }, { classification: entry.classification })
      } else {
        map.removeFeatureState({ source: 'buildings', id })
      }
    } catch {
      // feature may not exist yet
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
  const buildingsGeoJSONRef = useRef<GeoJSONFC | null>(null)
  const shadowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      center: BERLIN_MITTE,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('load', () => {
      fetch(BUILDINGS_GEOJSON_URL)
        .then((res) => res.json() as Promise<GeoJSONFC>)
        .then((geojson) => {
          normalizeGeoJSON(geojson)
          buildingsGeoJSONRef.current = geojson
          const bounds = getBoundsFromGeoJSON(geojson) ?? ([[13.37, 52.50], [13.43, 52.53]] as [[number, number], [number, number]])
          const [centerLng, centerLat] = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]

          map.addSource('buildings', {
            type: 'geojson',
            data: geojson as GeoJSON.FeatureCollection,
            promoteId: 'id',
          })

          // Sonnenposition und Licht
          const now = new Date()
          const { azimuthDeg, elevationDeg } = getSunPosition(centerLat, centerLng, now)
          map.setLight({
            anchor: 'map',
            position: sunToLightPosition(azimuthDeg, elevationDeg),
            color: '#ffffff',
            intensity: 0.6,
          } as maplibregl.LightSpecification)

          // GeoJSON-Schatten (weich durch versetzten Grundriss)
          const shadowData = buildShadowGeoJSON(geojson, centerLat, azimuthDeg, elevationDeg)
          map.addSource('building-shadows', { type: 'geojson', data: shadowData })
          map.addLayer({
            id: 'building-shadows',
            type: 'fill',
            source: 'building-shadows',
            paint: {
              'fill-color': '#1e293b',
              'fill-opacity': 0.18,
              'fill-outline-color': 'transparent',
            },
          })

          // Schatten minütlich aktualisieren
          if (shadowIntervalRef.current) clearInterval(shadowIntervalRef.current)
          shadowIntervalRef.current = setInterval(() => {
            const m = mapRef.current
            const bld = buildingsGeoJSONRef.current
            if (!m?.getSource('building-shadows') || !bld) return
            const { azimuthDeg: a, elevationDeg: e } = getSunPosition(centerLat, centerLng, new Date())
            ;(m.getSource('building-shadows') as maplibregl.GeoJSONSource).setData(buildShadowGeoJSON(bld, centerLat, a, e))
            m.setLight({
              anchor: 'map',
              position: sunToLightPosition(a, e),
              color: '#ffffff',
              intensity: 0.6,
            } as maplibregl.LightSpecification)
          }, 60_000)

          // 2D: Flächen-Layer
          map.addLayer({
            id: 'buildings-fill',
            type: 'fill',
            source: 'buildings',
            paint: {
              'fill-color': whiteModeRef.current ? '#ffffff' : buildFillColorExpression(filtersRef.current),
              'fill-opacity': 0.9,
              'fill-outline-color': whiteModeRef.current ? '#e2e8f0' : buildOutlineColorExpression(filtersRef.current),
            },
          })

          // 3D: Extrusions-Layer
          map.addLayer({
            id: 'buildings-extrusion',
            type: 'fill-extrusion',
            source: 'buildings',
            paint: {
              'fill-extrusion-color': (whiteModeRef.current ? '#ffffff' : (FILL_COLOR_WITH_SELECTION as maplibregl.ExpressionSpecification)),
              'fill-extrusion-height': buildExtrusionHeightExpression(filtersRef.current),
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.85,
            },
            layout: { visibility: 'none' },
          })

          let buildingsBoundsFitted = false
          map.on('sourcedata', (e) => {
            if (e.sourceId === 'buildings' && e.isSourceLoaded) {
              applyFeatureState(map, classificationsRef.current)
              if (!buildingsBoundsFitted) {
                buildingsBoundsFitted = true
                map.fitBounds(bounds, { padding: 40, maxZoom: 17 })
              }
            }
          })

          registerRemoveFeatureState((id) => {
            try { map.removeFeatureState({ source: 'buildings', id }) } catch { /* ignore */ }
          })

          const handleClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            const f = e.features?.[0]
            const featureId = f?.id ?? (f?.properties as Record<string, unknown>)?.['id']
            if (f && featureId != null) {
              const id = String(featureId)
              const props = (f.properties ?? {}) as Record<string, unknown>
              const shiftKey = (e.originalEvent as MouseEvent).shiftKey
              onBuildingClickRef.current?.(id, props, [e.lngLat.lng, e.lngLat.lat], shiftKey)
            }
          }
          map.on('click', 'buildings-fill', handleClick)
          map.on('click', 'buildings-extrusion', handleClick)
          map.getCanvas().style.cursor = 'default'
          map.on('mouseenter', 'buildings-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'buildings-fill', () => { map.getCanvas().style.cursor = 'default' })
          map.on('mouseenter', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'buildings-extrusion', () => { map.getCanvas().style.cursor = 'default' })
        })
        .catch(() => {})
    })

    mapRef.current = map
    return () => {
      if (shadowIntervalRef.current) clearInterval(shadowIntervalRef.current)
      shadowIntervalRef.current = null
      registerRemoveFeatureState(null)
      map.remove()
      mapRef.current = null
    }
  }, [registerRemoveFeatureState])

  // Feature-State aktualisieren, wenn Klassifizierungen sich ändern
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('buildings')) return
    applyFeatureState(map, classifications)
  }, [classifications])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('buildings')) return
    const prevIds = prevSelectedIdsRef.current
    prevSelectedIdsRef.current = selectedBuildingIds
    try {
      for (const id of prevIds) {
        map.setFeatureState({ source: 'buildings', id }, { selected: false })
      }
      for (const id of selectedBuildingIds) {
        map.setFeatureState({ source: 'buildings', id }, { selected: true })
      }
    } catch {
      // feature may not exist
    }
  }, [selectedBuildingIds])

  // Filter und 2D/3D-Layer-Sichtbarkeit
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

  // Basemap und Schatten im Weißmodus ausblenden
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('osm-tiles-layer')) return
    map.setLayoutProperty('osm-tiles-layer', 'visibility', whiteMode ? 'none' : 'visible')
    if (map.getLayer('building-shadows')) {
      map.setLayoutProperty('building-shadows', 'visibility', whiteMode ? 'none' : 'visible')
    }
  }, [whiteMode])

  return (
    <div ref={mapContainerRef} className="w-full h-full" aria-label="Karte Berlin-Mitte" />
  )
}
