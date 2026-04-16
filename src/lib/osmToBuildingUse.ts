import type { BuildingUse } from '@/types'

export type OsmTagConfidence = 'high' | 'low'

/**
 * Mappt OSM-Tag-Schlüssel (kleingeschrieben) auf interne Nutzung.
 * Priorität: spezifische amenity/building/railway vor generischem building=*.
 */
export function tagsToBuildingUse(tags: Record<string, string>): {
  buildingUse: BuildingUse
  confidence: OsmTagConfidence
} {
  const g = (k: string) => {
    const v = tags[k]
    return typeof v === 'string' ? v.toLowerCase().trim() : ''
  }

  const amenity = g('amenity')
  const building = g('building')
  const shop = g('shop')
  const office = g('office')
  const tourism = g('tourism')
  const railway = g('railway')
  const leisure = g('leisure')
  const manMade = g('man_made')
  const military = g('military')
  const historic = g('historic')

  const high = (u: BuildingUse) => ({ buildingUse: u, confidence: 'high' as const })
  const low = (u: BuildingUse) => ({ buildingUse: u, confidence: 'low' as const })

  if (amenity === 'hospital' || building === 'hospital') return high('krankenhaus')
  if (amenity === 'clinic' || amenity === 'doctors' || amenity === 'dentist') return high('krankenhaus')

  if (
    amenity === 'school' ||
    amenity === 'kindergarten' ||
    amenity === 'college' ||
    amenity === 'university' ||
    amenity === 'research_institute'
  ) {
    return high('schule')
  }

  if (amenity === 'place_of_worship' || building === 'church' || building === 'chapel' || building === 'cathedral') {
    return high('kirche')
  }

  if (
    amenity === 'townhall' ||
    amenity === 'courthouse' ||
    amenity === 'police' ||
    amenity === 'fire_station' ||
    amenity === 'post_office' ||
    amenity === 'embassy' ||
    amenity === 'government' ||
    amenity === 'public_building'
  ) {
    return high('amt')
  }

  if (railway === 'station' || railway === 'halt' || amenity === 'ferry_terminal') return high('bahnhof')

  if (shop !== '' || amenity === 'marketplace') return high('einkauf')

  if (office !== '' || amenity === 'office') return high('buero')

  if (tourism === 'hotel' || tourism === 'motel' || tourism === 'hostel' || tourism === 'guest_house') {
    return high('hotel')
  }

  if (
    amenity === 'theatre' ||
    amenity === 'cinema' ||
    amenity === 'library' ||
    amenity === 'museum' ||
    amenity === 'arts_centre' ||
    amenity === 'community_centre'
  ) {
    return high('kultur')
  }

  if (
    leisure === 'sports_centre' ||
    leisure === 'stadium' ||
    leisure === 'swimming_pool' ||
    leisure === 'fitness_centre' ||
    leisure === 'pitch'
  ) {
    return high('sport')
  }

  if (amenity === 'parking' || building === 'parking' || parkingLike(building, amenity)) return high('verkehr_parken')

  if (
    building === 'industrial' ||
    building === 'warehouse' ||
    building === 'factory' ||
    manMade === 'works' ||
    manMade === 'chimney'
  ) {
    return high('industrie')
  }

  if (military !== '' && military !== 'no') return low('sonstiges')

  if (
    building === 'residential' ||
    building === 'apartments' ||
    building === 'dormitory' ||
    building === 'house' ||
    building === 'detached' ||
    building === 'terrace' ||
    building === 'bungalow' ||
    building === 'hut' ||
    building === 'static_caravan'
  ) {
    return high('wohnhaus')
  }

  if (building === 'commercial' || building === 'retail' || building === 'supermarket' || building === 'kiosk') {
    if (building === 'retail' || building === 'supermarket' || building === 'kiosk') return high('einkauf')
    return high('buero')
  }

  if (building === 'office') return high('buero')

  if (historic === 'monastery' || historic === 'church') return high('kirche')

  if (building === 'yes' || building === '') {
    return low('unbekannt')
  }

  return low('sonstiges')
}

function parkingLike(building: string, amenity: string): boolean {
  return building === 'garage' || building === 'carport' || amenity === 'bicycle_parking'
}
