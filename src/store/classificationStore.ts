import type { ClassificationEntry } from '../types'

const STORAGE_KEY = 'altbaufinder-classifications'

function migrateId(oldId: string): string {
  if (/^way-\d+$/.test(oldId) || /^rel-\d+$/.test(oldId)) return oldId
  const waySlash = oldId.match(/^way\/(\d+)$/)
  if (waySlash) return `way-${waySlash[1]}`
  const relSlash = oldId.match(/^relation\/(\d+)$/)
  if (relSlash) return `rel-${relSlash[1]}`
  const relDash = oldId.match(/^relation-(\d+)$/)
  if (relDash) return `rel-${relDash[1]}`
  return oldId
}

export function loadClassifications(): Record<string, ClassificationEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ClassificationEntry>
    const migrated: Record<string, ClassificationEntry> = {}
    let needsMigration = false
    for (const [id, entry] of Object.entries(parsed)) {
      const newId = migrateId(id)
      if (newId !== id) needsMigration = true
      migrated[newId] = entry
    }
    if (needsMigration) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    }
    return migrated
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
