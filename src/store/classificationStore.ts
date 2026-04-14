import type { BuildingClassification, ClassificationEntry } from '../types'

const STORAGE_KEY = 'altbaufinder-classifications'

export function loadClassifications(): Record<string, ClassificationEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, { classification: BuildingClassification; lastModified: number }>
    return parsed
  } catch {
    return {}
  }
}

export function saveClassifications(data: Record<string, ClassificationEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore quota or other errors
  }
}
