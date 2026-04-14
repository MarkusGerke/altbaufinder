/**
 * Berechnet Sonnenazimut und -höhe für einen Ort und Zeitpunkt (vereinfachte Formeln).
 * Azimut: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West.
 * Höhe: 0 = Horizont, 90 = Zenit.
 */
export function getSunPosition(
  latDeg: number,
  lngDeg: number,
  date: Date
): { azimuthDeg: number; elevationDeg: number } {
  const latRad = (latDeg * Math.PI) / 180

  const dayOfYear =
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
    (24 * 60 * 60 * 1000)

  // Deklination der Sonne (ca.)
  const declinationRad =
    (23.45 * (Math.PI / 180) * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365))

  // Ortszeit in Dezimalstunden
  const localHours =
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600
  // Sonnenzeit: Lokalzeit + (Längengrad - 15°)/15 (15° = Zonenmeridian CET)
  const solarTimeHours = localHours + (lngDeg - 15) / 15
  const hourAngleDeg = 15 * (12 - solarTimeHours)
  const hourAngleRad = (hourAngleDeg * Math.PI) / 180

  // Elevation
  const sinEl =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad)
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinEl)))
  const elevationDeg = (elevationRad * 180) / Math.PI

  // Azimut (0 = Nord, 90 = Ost)
  const cosAz =
    (Math.sin(declinationRad) - Math.sin(latRad) * Math.sin(elevationRad)) /
    (Math.cos(latRad) * Math.cos(elevationRad) + 1e-8)
  const sinAz =
    (Math.cos(declinationRad) * Math.sin(hourAngleRad)) /
    (Math.cos(elevationRad) + 1e-8)
  let azimuthRad = Math.atan2(sinAz, cosAz)
  if (azimuthRad < 0) azimuthRad += 2 * Math.PI
  const azimuthDeg = (azimuthRad * 180) / Math.PI

  return { azimuthDeg, elevationDeg }
}

/**
 * MapLibre-Lichtposition: [r, azimuthal, polar].
 * azimuthal: 0 = Nord, 90 = Ost (bei anchor: "map").
 * polar: 0 = direkt über dem Objekt, 90 = Horizont.
 */
export function sunToLightPosition(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const polar = 90 - elevationDeg // 0 = oben, 90 = Horizont
  return [1.5, azimuthDeg, Math.max(0, Math.min(90, polar))]
}
