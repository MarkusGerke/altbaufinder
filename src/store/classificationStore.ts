import type { BuildingClassification, ClassificationEntry } from '../types'

const STORAGE_KEY = 'altbaufinder-classifications'

/** Einzelnen API-/LocalStorage-Eintrag von 3er-Skala auf 5er-Skala heben. */
export function migrateLegacyClassification(
  entry: ClassificationEntry
): ClassificationEntry | null {
  const c = entry.classification as BuildingClassification | 'original' | 'altbau_entstuckt' | 'kein_altbau'
  if (c === 'original') {
    return { ...entry, classification: 'stuck_perfekt' }
  }
  if (c === 'altbau_entstuckt') {
    return { ...entry, classification: 'stuck_teilweise' }
  }
  if (c === 'kein_altbau') {
    return null
  }
  return entry
}

function migrateId(oldId: string): string {
  if (/^way-\d+$/.test(oldId) || /^rel-\d+$/.test(oldId)) return oldId
  if (/^way-\d+#[0-9a-f]+$/.test(oldId) || /^rel-\d+#[0-9a-f]+$/.test(oldId)) return oldId
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
      if (!entry || typeof entry !== 'object') continue
      const newId = migrateId(id)
      if (newId !== id) needsMigration = true
      const next = migrateLegacyClassification(entry as ClassificationEntry)
      if (next === null) {
        needsMigration = true
        continue
      }
      if (next !== entry) needsMigration = true
      migrated[newId] = next
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
