import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useClassification } from '../context/ClassificationContext'
import type { ClassificationEntry } from '../types'
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

function tileIdToStringId(tileId: number): string {
  const typeCode = tileId % 10
  const osmId = Math.floor(tileId / 10)
  const prefix = typeCode === 3 ? 'rel' : 'way'
  return `${prefix}-${osmId}`
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function classificationVisible(c: ClassificationEntry['classification'], filters: FilterState): boolean {
  if (!c) return false
  switch (c) {
    case 'stuck_perfekt':
      return filters.showStuckPerfekt
    case 'stuck_schoen':
      return filters.showStuckSchoen
    case 'stuck_mittel':
      return filters.showStuckMittel
    case 'stuck_teilweise':
      return filters.showStuckTeilweise
    case 'entstuckt':
      return filters.showEntstuckt
    default:
      return false
  }
}

function buildClassificationFC(
  classifications: Record<string, ClassificationEntry>,
  filters: FilterState
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const [id, entry] of Object.entries(classifications)) {
    if (!entry.classification || !entry.geometry) continue
    if (!classificationVisible(entry.classification, filters)) continue
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
  'stuck_perfekt',
  CLASSIFICATION_HEX.stuck_perfekt,
  'stuck_schoen',
  CLASSIFICATION_HEX.stuck_schoen,
  'stuck_mittel',
  CLASSIFICATION_HEX.stuck_mittel,
  'stuck_teilweise',
  CLASSIFICATION_HEX.stuck_teilweise,
  'entstuckt',
  CLASSIFICATION_HEX.entstuckt,
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
  onBuildingClick?: (building: SelectedBuildingGeo, shiftKey: boolean) => void
  filters: FilterState
  viewMode: '2d' | '3d'
  whiteMode: boolean
  selectedBuildings: SelectedBuildingGeo[]
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

export default function MapView({ onBuildingClick, filters, viewMode, whiteMode, selectedBuildings }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const { classifications } = useClassification()
  const classificationsRef = useRef(classifications)
  classificationsRef.current = classifications
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const whiteModeRef = useRef(whiteMode)
  whiteModeRef.current = whiteMode
  const onBuildingClickRef = useRef(onBuildingClick)
  onBuildingClickRef.current = onBuildingClick
  const selectedBuildingsRef = useRef(selectedBuildings)
  selectedBuildingsRef.current = selectedBuildings

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

      const baseFill = whiteModeRef.current ? '#ffffff' : '#94a3b8'
      const baseOutline = whiteModeRef.current ? '#e2e8f0' : '#64748b'
      const showUnclassifiedBase = filtersRef.current.showUnclassified
      const baseFillOpacity = showUnclassifiedBase ? 0.9 : 0
      const baseOutlinePaint = showUnclassifiedBase ? baseOutline : 'rgba(0,0,0,0)'

      map.addLayer({
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
      })

      const heightExpr: maplibregl.ExpressionSpecification = [
        'max', 8,
        ['coalesce', ['to-number', ['get', 'render_height']], 10],
      ] as unknown as maplibregl.ExpressionSpecification

      map.addLayer({
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
          'fill-extrusion-opacity': showUnclassifiedBase ? 0.85 : 0,
        },
        layout: { visibility: 'none' },
      })

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

      // API kann Klassifizierungen liefern, bevor dieser Handler lief — der React-Effekt sieht die Quelle noch nicht.
      // Einmal synchron anwenden, sobald Quellen existieren.
      const clsSrc = map.getSource(CLASSIFICATION_SOURCE) as maplibregl.GeoJSONSource
      clsSrc.setData(buildClassificationFC(classificationsRef.current, filtersRef.current))
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
    src.setData(buildClassificationFC(classifications, filters))
  }, [classifications, filters])

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
    map.setPaintProperty('buildings-extrusion', 'fill-extrusion-opacity', showU ? 0.85 : 0)
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
