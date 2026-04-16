import type { BuildingUse } from '@/types'

/** Reihenfolge in Auswahllisten (interne Schlüssel). */
export const BUILDING_USE_ORDER: BuildingUse[] = [
  'wohnhaus',
  'buero',
  'einkauf',
  'krankenhaus',
  'amt',
  'bahnhof',
  'schule',
  'hotel',
  'industrie',
  'kirche',
  'kultur',
  'sport',
  'verkehr_parken',
  'sonstiges',
  'unbekannt',
]

export const BUILDING_USE_LABELS: Record<BuildingUse, string> = {
  wohnhaus: 'Wohnhaus / Wohnen',
  buero: 'Büro / Verwaltung',
  einkauf: 'Einkauf / Handel',
  krankenhaus: 'Krankenhaus / Gesundheit',
  amt: 'Amt / Behörde / öffentliche Verwaltung',
  bahnhof: 'Bahnhof / Schienenverkehr',
  schule: 'Schule / Bildung / Betreuung',
  hotel: 'Hotel / Unterkunft',
  industrie: 'Industrie / Gewerbe / Lager',
  kirche: 'Kirche / Gotteshaus',
  kultur: 'Kultur (Theater, Museum, Bibliothek …)',
  sport: 'Sport / Freizeitanlage',
  verkehr_parken: 'Parken / Verkehrsbauwerk',
  sonstiges: 'Sonstiges',
  unbekannt: 'Unbekannt',
}
