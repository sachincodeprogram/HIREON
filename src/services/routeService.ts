import { GOOGLE_MAPS_API_KEY, OSRM_BASE_URL } from '../constants/api';
import { Coordinates } from '../types';

export type LatLng = { latitude: number; longitude: number };

export type RouteStep = {
  text: string;        // human instruction ("Turn Left onto MG Road")
  icon: string;        // emoji arrow
  location: Coordinates; // where the maneuver happens
  distance: number;    // metres for this step
  type: string;        // maneuver type ('depart' | 'turn' | ... )
};

export type RouteResult = {
  coords: LatLng[];
  steps: RouteStep[];
  distance: number;    // metres (total)
  duration: number;    // seconds (total)
  source: 'google' | 'osrm';
};

/* ─────────────── encoded polyline decoder (Google / polyline5) ─────────────── */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/* ─────────────────────────── instruction helpers ─────────────────────────── */
const CARDINALS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
const cardinal = (deg: number) => CARDINALS[Math.round((deg % 360) / 45) % 8];

function modifierLabel(modifier?: string): { text: string; icon: string } {
  switch (modifier) {
    case 'left':         return { text: 'Turn Left',     icon: '⬅️' };
    case 'right':        return { text: 'Turn Right',    icon: '➡️' };
    case 'slight left':  return { text: 'Slight Left',   icon: '↖️' };
    case 'slight right': return { text: 'Slight Right',  icon: '↗️' };
    case 'sharp left':   return { text: 'Sharp Left',    icon: '⬅️' };
    case 'sharp right':  return { text: 'Sharp Right',   icon: '➡️' };
    case 'uturn':        return { text: 'Make a U-turn', icon: '↩️' };
    case 'straight':
    default:             return { text: 'Continue Straight', icon: '⬆️' };
  }
}

// Routes API maneuver enum ("TURN_LEFT") → legacy-style token ("turn-left")
function normalizeManeuver(m?: string): string {
  return (m || '').toLowerCase().replace(/_/g, '-');
}

// fallback instruction text when the API omits `instructions`
function maneuverText(m: string): string {
  if (!m || m === 'depart' || m === 'name-change') return 'Continue Straight';
  if (m.includes('uturn'))      return 'Make a U-turn';
  if (m.includes('roundabout')) return 'Take the roundabout';
  if (m.includes('merge'))      return 'Merge';
  if (m.includes('ramp'))       return 'Take the ramp';
  if (m.includes('slight') && m.includes('left'))  return 'Slight Left';
  if (m.includes('slight') && m.includes('right')) return 'Slight Right';
  if (m.includes('left'))  return 'Turn Left';
  if (m.includes('right')) return 'Turn Right';
  return 'Continue Straight';
}

// Google `maneuver` (e.g. "turn-left", "roundabout-right") → arrow icon
function googleIcon(maneuver?: string): string {
  if (!maneuver) return '⬆️';
  if (maneuver.includes('uturn'))      return '↩️';
  if (maneuver.includes('roundabout')) return '🔄';
  if (maneuver.includes('merge'))      return '🔀';
  if (maneuver.includes('ramp'))       return maneuver.includes('left') ? '↘️' : '↗️';
  if (maneuver.includes('slight') && maneuver.includes('left'))  return '↖️';
  if (maneuver.includes('slight') && maneuver.includes('right')) return '↗️';
  if (maneuver.includes('left'))  return '⬅️';
  if (maneuver.includes('right')) return '➡️';
  return '⬆️'; // straight / depart
}

// OSRM maneuver object → { text, icon }
function osrmInstruction(m: any, name: string): { text: string; icon: string } {
  const road = name ? ` onto ${name}` : '';
  switch (m?.type) {
    case 'depart':    return { text: `Head ${cardinal(m.bearing_after ?? 0)}${road}`, icon: '⬆️' };
    case 'arrive':    return { text: 'Arrive at destination', icon: '🏁' };
    case 'roundabout':
    case 'rotary':    return { text: `Take the roundabout${road}`, icon: '🔄' };
    case 'merge':     return { text: `Merge${road}`, icon: '🔀' };
    case 'on ramp':   return { text: `Take the ramp${road}`, icon: '↗️' };
    case 'off ramp':  return { text: `Take the exit${road}`, icon: '↘️' };
    case 'fork': {
      const l = modifierLabel(m?.modifier);
      return { text: `Keep ${m?.modifier || 'straight'}${road}`, icon: l.icon };
    }
    default: {
      const l = modifierLabel(m?.modifier);
      return { text: `${l.text}${road}`, icon: l.icon };
    }
  }
}

/* ───────────────────────────── providers ───────────────────────────── */
// Primary: Google Routes API (New). Needs "Routes API" enabled on the key + billing.
// POST computeRoutes with an X-Goog-FieldMask that limits the response payload.
async function fetchGoogle(origin: Coordinates, dest: Coordinates): Promise<RouteResult | null> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'routes.distanceMeters',
        'routes.duration',
        'routes.polyline.encodedPolyline',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.startLocation',
        'routes.legs.steps.navigationInstruction',
      ].join(','),
    },
    body: JSON.stringify({
      origin:      { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: dest.lat,   longitude: dest.lng   } } },
      travelMode:        'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      polylineEncoding:  'ENCODED_POLYLINE',
      languageCode:      'en-US',
      units:             'METRIC',
    }),
  });
  const json = await res.json();
  const route = json?.routes?.[0];
  if (!route?.polyline?.encodedPolyline) {
    // not enabled / quota / no result → let caller fall back to OSRM
    return null;
  }
  const coords = decodePolyline(route.polyline.encodedPolyline);
  const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: any, i: number) => {
    const ni  = s.navigationInstruction;
    const man = normalizeManeuver(ni?.maneuver);
    const ll  = s.startLocation?.latLng;
    return {
      text:     ni?.instructions || maneuverText(man),
      icon:     googleIcon(man),
      location: { lat: ll?.latitude ?? origin.lat, lng: ll?.longitude ?? origin.lng },
      distance: s.distanceMeters ?? 0,
      type:     man || (i === 0 ? 'depart' : 'continue'),
    };
  });
  // Routes API returns duration as a string like "1234s"
  const durationSec = parseInt(String(route.duration ?? '0').replace('s', ''), 10) || 0;
  return { coords, steps, distance: route.distanceMeters ?? 0, duration: durationSec, source: 'google' };
}

// Fallback: OSRM (free, no key) — used until the Routes API is enabled
async function fetchOsrm(origin: Coordinates, dest: Coordinates): Promise<RouteResult | null> {
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/` +
    `${origin.lng},${origin.lat};${dest.lng},${dest.lat}` +
    `?overview=full&geometries=geojson&steps=true`;
  const res  = await fetch(url);
  const json = await res.json();
  const route = json?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;
  const coords: LatLng[] = route.geometry.coordinates.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }));
  const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: any) => {
    const instr = osrmInstruction(s.maneuver, s.name);
    const loc   = s.maneuver?.location ?? [origin.lng, origin.lat];
    return { text: instr.text, icon: instr.icon, location: { lat: loc[1], lng: loc[0] }, distance: s.distance, type: s.maneuver?.type ?? 'continue' };
  });
  return { coords, steps, distance: route.distance, duration: route.duration, source: 'osrm' };
}

/**
 * Get a driving route + turn-by-turn steps from `origin` to `dest`.
 * Tries Google Directions first; if it's unavailable (API not enabled, quota,
 * no result) it transparently falls back to OSRM. Returns null only if both fail.
 */
export async function fetchRoute(origin: Coordinates, dest: Coordinates): Promise<RouteResult | null> {
  try { const g = await fetchGoogle(origin, dest); if (g) return g; } catch { /* fall back */ }
  try { const o = await fetchOsrm(origin, dest);   if (o) return o; } catch { /* both failed */ }
  return null;
}
