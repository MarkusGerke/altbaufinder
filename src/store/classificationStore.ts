import type { BuildingClassification, ClassificationEntry } from '../types'

const STORAGE_KEY = 'altbaufinder-classifications'

/** Alte 5er-Werte und Legacy-Strings → aktuelles Modell (3 + kein_altbau). */
const LEGACY_TO_NEW: Record<string, Exclude<BuildingClassification, null>> = {
  stuck_perfekt: 'altbau_gruen',
  stuck_schoen: 'altbau_gruen',
  stuck_mittel: 'altbau_gelb',
  stuck_teilweise: 'altbau_gelb',
  entstuckt: 'altbau_rot',
  original: 'altbau_gruen',
  altbau_entstuckt: 'altbau_gelb',
}

function normalizeStoredClassification(
  c: string | null | undefined
): BuildingClassification | 'DROP' | 'KEEP_NULL' {
  if (c === undefined || c === null) return 'KEEP_NULL'
  if (c === '') return 'KEEP_NULL'
  if (c === 'kein_altbau') return 'kein_altbau'
  if (c === 'altbau_gruen' || c === 'altbau_gelb' || c === 'altbau_rot') {
    return c
  }
  const mapped = LEGACY_TO_NEW[c]
  if (mapped) return mapped
  return 'DROP'
}

/** Einzelnen API-/LocalStorage-Eintrag migrieren (alte Skalen → 3 Stufen + kein_altbau). */
export function migrateLegacyClassification(
  entry: ClassificationEntry
): ClassificationEntry | null {
  const c = entry.classification as string | null | undefined
  const norm = normalizeStoredClassification(c)
  if (norm === 'DROP') return null
  if (norm === 'KEEP_NULL') return null
  if (norm === entry.classification) return entry
  return { ...entry, classification: norm }
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
