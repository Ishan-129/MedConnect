/**
 * Haversine Formula for Geodesic Distance Calculation
 * Implements section 0.4 of MedConnect Pulse Specification:
 * 
 * a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
 * c = 2 · atan2(√a, √(1−a))
 * distance_km = R · c  where R = 6371 (Earth's mean radius in km)
 * 
 * Zero paid Maps API dependencies required.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusKm = 10
): boolean {
  return calculateDistanceKm(lat1, lon1, lat2, lon2) <= radiusKm;
}
