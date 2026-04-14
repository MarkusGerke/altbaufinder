export type BuildingClassification =
  | 'stuck_perfekt'
  | 'stuck_schoen'
  | 'stuck_mittel'
  | 'stuck_teilweise'
  | 'entstuckt'
  | null

export interface ClassificationEntry {
  classification: BuildingClassification
  yearOfConstruction?: number | null
  lastModified: number
  geometry?: GeoJSON.Geometry | null
}

export type ViewMode = '2d' | '3d'
export type AppMode = 'viewer' | 'editor'
