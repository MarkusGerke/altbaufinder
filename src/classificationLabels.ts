import type { BuildingClassification } from './types'

/** Hauptstufen (Karte, Filter, Legende). */
export const CLASSIFICATION_ORDER: Exclude<BuildingClassification, null>[] = [
  'altbau_gruen',
  'altbau_gelb',
  'altbau_rot',
]

/** Inkl. Editor-only „kein Altbau“. */
export const CLASSIFICATION_ORDER_WITH_KEIN: Exclude<BuildingClassification, null>[] = [
  ...CLASSIFICATION_ORDER,
  'kein_altbau',
]

/** Anzeige im Panel / Legende */
export const CLASSIFICATION_LABELS: Record<Exclude<BuildingClassification, null>, string> = {
  altbau_gruen: 'Starker Altbau / schöne Fassade',
  altbau_gelb: 'Mittlere oder gemischte Fassade',
  altbau_rot: 'Wenig oder kein Stuck / entstuckt',
  kein_altbau: 'Kein Altbau (nur Editor-Karte)',
}

/** Kartenfarbe (Hex) */
export const CLASSIFICATION_HEX: Record<Exclude<BuildingClassification, null>, string> = {
  altbau_gruen: '#16a34a',
  altbau_gelb: '#eab308',
  altbau_rot: '#dc2626',
  kein_altbau: '#171717',
}

/** Kurzbezeichnung für Toolbar-Checkboxen */
export const CLASSIFICATION_SHORT: Record<Exclude<BuildingClassification, null>, string> = {
  altbau_gruen: 'Grün',
  altbau_gelb: 'Gelb',
  altbau_rot: 'Rot',
  kein_altbau: 'Schwarz',
}

/** Legende: `stufe-N.webp` / `stufe-N.svg` (N = 1…3 für die drei Stufen; optional 4 für „kein Altbau“). */
export function legendStepImageSources(stepIndex1: number): { webp: string; svg: string } {
  return {
    webp: `/legend/stufe-${stepIndex1}.webp`,
    svg: `/legend/stufe-${stepIndex1}.svg`,
  }
}
