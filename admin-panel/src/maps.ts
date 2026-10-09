/// <reference types="google.maps" />
// Google Maps JavaScript API loader — wahi Google Cloud key jo app use karta hai.
// Key build time par VITE_GOOGLE_MAPS_API_KEY env se aati hai (Vercel env / .env.local).

export const MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

let promise: Promise<typeof google.maps> | null = null
let authFailed = false
const authListeners = new Set<() => void>()

export const mapsAuthFailed = () => authFailed
export const onMapsAuthFailure = (fn: () => void) => { authListeners.add(fn); return () => { authListeners.delete(fn) } }

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    if (!MAPS_KEY) { reject(new Error('Google Maps key is not configured (VITE_GOOGLE_MAPS_API_KEY).')); return }
    const w = window as unknown as Record<string, unknown>
    // Google key reject kare (API enable nahi / restriction) to yeh global call hota hai
    w.gm_authFailure = () => { authFailed = true; authListeners.forEach(f => f()) }
    w.__hireonMapsReady = () => resolve(google.maps)
    const s = document.createElement('script')
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(MAPS_KEY) + '&v=weekly&loading=async&callback=__hireonMapsReady'
    s.async = true
    s.onerror = () => { promise = null; reject(new Error('Could not load Google Maps. Check your connection.')) }
    document.head.appendChild(s)
  })
  return promise
}

// Dark theme ke liye map style (light me Google default)
export const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b2130' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8f9ab0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#11151f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3244' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#36405a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
]
export const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

export const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Shahar me average ~18 km/h (traffic) + 1.3x road factor straight-line par
export const etaMinutes = (km: number) => Math.max(1, Math.round((km * 1.3 / 18) * 60))

export const markerSvg = (fill: string, label = '', ring = '#ffffff') =>
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">' +
    '<path d="M18 43s14-13.2 14-25A14 14 0 0 0 4 18c0 11.8 14 25 14 25z" fill="' + fill + '" stroke="' + ring + '" stroke-width="2.5"/>' +
    '<circle cx="18" cy="18" r="6.5" fill="#fff"/>' +
    (label ? '<text x="18" y="21.5" font-family="Inter,Arial" font-size="9" font-weight="700" text-anchor="middle" fill="' + fill + '">' + label + '</text>' : '') +
    '</svg>')

export const riderSvg = (fill: string, ring = '#ffffff') =>
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
    '<circle cx="17" cy="17" r="15" fill="' + fill + '" stroke="' + ring + '" stroke-width="3"/>' +
    '<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(7 7) scale(.83)">' +
    '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 11.5"/><path d="m5.5 17.5 4-7.5h6l-3 7.5"/></g>' +
    '</svg>')
