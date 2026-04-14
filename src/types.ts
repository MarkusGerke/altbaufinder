export type BuildingClassification = 'original' | 'altbau_entstuckt' | 'kein_altbau' | null

export interface ClassificationEntry {
  classification: BuildingClassification
  yearOfConstruction?: number | null
  lastModified: number
}

export type ViewMode = '2d' | '3d'
export type AppMode = 'viewer' | 'editor'
