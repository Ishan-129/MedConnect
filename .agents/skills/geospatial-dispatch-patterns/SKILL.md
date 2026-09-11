---
name: geospatial-dispatch-patterns
description: Geospatial patterns for emergency hospital dispatch, Leaflet radar maps, Haversine formula distance calculations, proximity radius queries, and ambulance position tracking.
---

# Geospatial Dispatch Patterns

Standardized patterns for emergency geo-routing, hospital radar mapping, and proximity queries in MedConnect Pulse.

## When to Activate
- Calculating nearest hospitals within a given km radius
- Implementing the Haversine formula in TypeScript or PostgreSQL
- Building Leaflet / Mapbox radar maps with pulsing emergency markers
- Visualizing hospital resource capacity and ambulance en-route locations

## 1. Fast Haversine Distance (TypeScript)

```ts
export interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_KM * c).toFixed(2));
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
```

## 2. PostgreSQL / Supabase Spatial Query (Native)

For server-side radius queries without heavy PostGIS extensions:

```sql
CREATE OR REPLACE FUNCTION get_nearby_hospitals(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 15.0
)
RETURNS TABLE (
  hospital_id UUID,
  hospital_name TEXT,
  distance_km DOUBLE PRECISION,
  icu_available INT,
  oxygen_available INT,
  blood_units_available INT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    h.id AS hospital_id,
    h.name AS hospital_name,
    ROUND(
      (6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(p_lat)) * cos(radians(h.lat)) *
          cos(radians(h.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(h.lat))
        ))
      ))::numeric, 2
    )::double precision AS distance_km,
    h.icu_available,
    h.oxygen_available,
    h.blood_units_available
  FROM hospitals h
  WHERE (
    6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_lat)) * cos(radians(h.lat)) *
        cos(radians(h.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(h.lat))
      ))
    )
  ) <= p_radius_km
  ORDER BY distance_km ASC;
$$;
```

## 3. Leaflet Radar Map Component Pattern

- Use custom SVG `divIcon` with CSS animations for pulsing emergency epicenter markers.
- Render hospital markers with color-coded capacity badges (Green = available, Red = full).
- Keep coordinates validated (`-90 <= lat <= 90`, `-180 <= lng <= 180`).
