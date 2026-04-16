<?php
/**
 * OSM-Tags → interner building_use-Schlüssel (muss mit src/lib/osmToBuildingUse.ts übereinstimmen).
 */

/** @return array{0: string, 1: string} [buildingUse, confidence high|low] */
function osm_tags_to_building_use(array $tags): array {
    $g = function (string $k) use ($tags): string {
        if (!isset($tags[$k]) || !is_string($tags[$k])) {
            return '';
        }
        return strtolower(trim($tags[$k]));
    };

    $amenity = $g('amenity');
    $building = $g('building');
    $shop = $g('shop');
    $office = $g('office');
    $tourism = $g('tourism');
    $railway = $g('railway');
    $leisure = $g('leisure');
    $manMade = $g('man_made');
    $military = $g('military');
    $historic = $g('historic');

    $high = function (string $u): array {
        return [$u, 'high'];
    };
    $low = function (string $u): array {
        return [$u, 'low'];
    };

    if ($amenity === 'hospital' || $building === 'hospital') {
        return $high('krankenhaus');
    }
    if ($amenity === 'clinic' || $amenity === 'doctors' || $amenity === 'dentist') {
        return $high('krankenhaus');
    }

    if (in_array($amenity, ['school', 'kindergarten', 'college', 'university', 'research_institute'], true)) {
        return $high('schule');
    }

    if ($amenity === 'place_of_worship' || in_array($building, ['church', 'chapel', 'cathedral'], true)) {
        return $high('kirche');
    }

    if (in_array($amenity, [
        'townhall', 'courthouse', 'police', 'fire_station', 'post_office',
        'embassy', 'government', 'public_building',
    ], true)) {
        return $high('amt');
    }

    if (in_array($railway, ['station', 'halt'], true) || $amenity === 'ferry_terminal') {
        return $high('bahnhof');
    }

    if ($shop !== '' || $amenity === 'marketplace') {
        return $high('einkauf');
    }

    if ($office !== '' || $amenity === 'office') {
        return $high('buero');
    }

    if (in_array($tourism, ['hotel', 'motel', 'hostel', 'guest_house'], true)) {
        return $high('hotel');
    }

    if (in_array($amenity, [
        'theatre', 'cinema', 'library', 'museum', 'arts_centre', 'community_centre',
    ], true)) {
        return $high('kultur');
    }

    if (in_array($leisure, ['sports_centre', 'stadium', 'swimming_pool', 'fitness_centre', 'pitch'], true)) {
        return $high('sport');
    }

    if ($amenity === 'parking' || $building === 'parking' || _parking_like($building, $amenity)) {
        return $high('verkehr_parken');
    }

    if (in_array($building, ['industrial', 'warehouse', 'factory'], true)
        || in_array($manMade, ['works', 'chimney'], true)) {
        return $high('industrie');
    }

    if ($military !== '' && $military !== 'no') {
        return $low('sonstiges');
    }

    if (in_array($building, [
        'residential', 'apartments', 'dormitory', 'house', 'detached', 'terrace',
        'bungalow', 'hut', 'static_caravan',
    ], true)) {
        return $high('wohnhaus');
    }

    if (in_array($building, ['commercial', 'retail', 'supermarket', 'kiosk'], true)) {
        if (in_array($building, ['retail', 'supermarket', 'kiosk'], true)) {
            return $high('einkauf');
        }
        return $high('buero');
    }

    if ($building === 'office') {
        return $high('buero');
    }

    if (in_array($historic, ['monastery', 'church'], true)) {
        return $high('kirche');
    }

    if ($building === 'yes' || $building === '') {
        return $low('unbekannt');
    }

    return $low('sonstiges');
}

function _parking_like(string $building, string $amenity): bool {
    return $building === 'garage' || $building === 'carport' || $amenity === 'bicycle_parking';
}

/** @return array<string, true> */
function valid_building_use_keys(): array {
    return array_flip([
        'wohnhaus', 'buero', 'einkauf', 'krankenhaus', 'amt', 'bahnhof', 'schule', 'hotel',
        'industrie', 'kirche', 'kultur', 'sport', 'verkehr_parken', 'sonstiges', 'unbekannt',
    ]);
}

function normalize_building_use(?string $v): ?string {
    if ($v === null || $v === '') {
        return null;
    }
    $valid = valid_building_use_keys();
    return isset($valid[$v]) ? $v : null;
}
