import type { BuildingClassification } from './types'

export const CLASSIFICATION_ORDER: Exclude<BuildingClassification, null>[] = [
  'stuck_perfekt',
  'stuck_schoen',
  'stuck_mittel',
  'stuck_teilweise',
  'entstuckt',
]

/** Anzeige im Panel / Legende */
export const CLASSIFICATION_LABELS: Record<Exclude<BuildingClassification, null>, string> = {
  stuck_perfekt: 'Sehr schöner Altbau, perfekte Fassade',
  stuck_schoen: 'Schöne Fassade',
  stuck_mittel: 'Mittelschön',
  stuck_teilweise: 'Alte Fassade oder nur teilbestuckt',
  entstuckt: 'Kein Stuck',
}

/** Kartenfarbe (Hex) */
export const CLASSIFICATION_HEX: Record<Exclude<BuildingClassification, null>, string> = {
  stuck_perfekt: '#16a34a',
  stuck_schoen: '#86efac',
  stuck_mittel: '#eab308',
  stuck_teilweise: '#f97316',
  entstuckt: '#dc2626',
}

/** Kurzbezeichnung für Toolbar-Checkboxen */
export const CLASSIFICATION_SHORT: Record<Exclude<BuildingClassification, null>, string> = {
  stuck_perfekt: 'Stufe 1',
  stuck_schoen: 'Stufe 2',
  stuck_mittel: 'Stufe 3',
  stuck_teilweise: 'Stufe 4',
  entstuckt: 'Stufe 5',
}

/** Legende: zuerst `stufe-N.webp` (eigene Fotos), bei Fehler Fallback `stufe-N.svg`. */
export function legendStepImageSources(stepIndex1: number): { webp: string; svg: string } {
  return {
    webp: `/legend/stufe-${stepIndex1}.webp`,
    svg: `/legend/stufe-${stepIndex1}.svg`,
  }
}
