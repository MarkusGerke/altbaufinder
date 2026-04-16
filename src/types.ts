export type BuildingClassification =
  | 'altbau_gruen'
  | 'altbau_gelb'
  | 'altbau_rot'
  | 'kein_altbau'
  | null

/** Gebäudenutzung (intern, nicht OSM schreiben). */
export type BuildingUse =
  | 'wohnhaus'
  | 'buero'
  | 'einkauf'
  | 'krankenhaus'
  | 'amt'
  | 'bahnhof'
  | 'schule'
  | 'hotel'
  | 'industrie'
  | 'kirche'
  | 'kultur'
  | 'sport'
  | 'verkehr_parken'
  | 'sonstiges'
  | 'unbekannt'

export interface ClassificationEntry {
  classification: BuildingClassification
  yearOfConstruction?: number | null
  lastModified: number
  geometry?: GeoJSON.Geometry | null
  /** MapLibre-Vektor-Kachel-Feature-ID (`feature.id`), für 3D-Filter & Vektor-Extrusion. */
  vectorFeatureId?: number | null
  /** Optionale Nutzungskategorie (OSM-Vorschlag überschreibbar). */
  buildingUse?: BuildingUse | null
}

export type ViewMode = '2d' | '3d'
export type AppMode = 'viewer' | 'editor'
