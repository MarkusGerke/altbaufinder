export type BuildingClassification =
  | 'altbau_gruen'
  | 'altbau_gelb'
  | 'altbau_rot'
  | 'kein_altbau'
  | null

export interface ClassificationEntry {
  classification: BuildingClassification
  yearOfConstruction?: number | null
  lastModified: number
  geometry?: GeoJSON.Geometry | null
  /** MapLibre-Vektor-Kachel-Feature-ID (`feature.id`), für 3D-Filter & Vektor-Extrusion. */
  vectorFeatureId?: number | null
}

export type ViewMode = '2d' | '3d'
export type AppMode = 'viewer' | 'editor'
