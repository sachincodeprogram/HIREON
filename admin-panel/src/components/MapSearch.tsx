/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LiveRider, Order } from '../api'
import { IconBike, IconMap, IconPin, IconSearch, IconX } from './icons'
import { markerSvg } from '../maps'

// Map ke upar search box — do roop:
//  • 'location' (left): koi bhi jagah/landmark + online riders naam/phone se
//  • 'area' (right): sirf area/locality/city/PIN — chunne par boundary highlight
//    aur us area me kitne riders / active orders hain uska summary
// Google Places autocomplete (naya API) use hota hai; woh key par band ho to Geocoder fallback.
type Hit =
  | { kind: 'rider'; id: string; title: string; sub: string; rider: LiveRider }
  | { kind: 'place' | 'area'; id: string; title: string; sub: string; pred?: google.maps.places.PlacePrediction; geo?: google.maps.GeocoderResult; osm?: OsmHit }

// Photon (OpenStreetMap) result — Google APIs key par band hon tab ka fallback
type OsmHit = { lat: number; lng: number; extent?: [number, number, number, number] } // [W, N, E, S]
type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: { osm_id: number; osm_type: string; type?: string; name?: string; street?: string; housenumber?: string; district?: string; city?: string; county?: string; state?: string; postcode?: string; extent?: [number, number, number, number] }
}
const PHOTON = 'https://photon.komoot.io/api/'
const INDIA_BBOX = '68,6,98,37'

const AREA_TYPES = ['sublocality', 'locality', 'neighborhood', 'postal_code', 'administrative_area_level_2', 'administrative_area_level_3']
const AREA_FALLBACK_RADIUS_M = 1500

export default function MapSearch({ map, riders, orders = [], variant = 'location', onRider }: {
  map: google.maps.Map | null; riders: LiveRider[]; orders?: Order[]
  variant?: 'location' | 'area'; onRider?: (r: LiveRider) => void
}) {
  const isArea = variant === 'area'
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [area, setArea] = useState<{ name: string; bounds: google.maps.LatLngBounds } | null>(null)
  const pin = useRef<google.maps.Marker | null>(null)
  const shape = useRef<google.maps.Rectangle | null>(null)
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const placesBroken = useRef(false)
  const geocoderBroken = useRef(false)
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Bahar click karo to dropdown band
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => () => { pin.current?.setMap(null); shape.current?.setMap(null) }, [])

  // Type karte hi (debounce) suggestions lao
  useEffect(() => {
    const text = q.trim()
    if (text.length < 2 || !map) { setHits([]); setLoading(false); setNote(null); return }
    const n = text.toLowerCase()
    const riderHits: Hit[] = isArea ? [] : riders
      .filter(r => r.location && [r.name, r.phone, r.vehicleNumber].some(v => v?.toLowerCase().includes(n)))
      .slice(0, 3)
      .map(r => ({ kind: 'rider', id: 'r' + r._id, title: r.name, sub: ['Rider', r.vehicleNumber, r.phone].filter(Boolean).join(' · '), rider: r }))
    setHits(riderHits)
    setActive(0)
    setLoading(true)
    const my = ++seq.current
    const t = setTimeout(async () => {
      let places: Hit[] = []
      let failed = false
      try { places = await fetchPlaces(text) } catch { failed = true }
      if (my !== seq.current) return
      setHits([...riderHits, ...places])
      setNote(failed ? 'Search is unavailable right now. Please try again.'
        : !riderHits.length && !places.length ? (isArea ? 'No matching areas' : 'No matching places') : null)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, map])

  async function fetchPlaces(text: string): Promise<Hit[]> {
    const kind = isArea ? 'area' as const : 'place' as const
    if (!placesBroken.current) {
      try {
        const lib = await google.maps.importLibrary('places') as google.maps.PlacesLibrary
        token.current ??= new lib.AutocompleteSessionToken()
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text, sessionToken: token.current, includedRegionCodes: ['in'],
          locationBias: map?.getCenter() ?? undefined,
          ...(isArea ? { includedPrimaryTypes: ['(regions)'] } : {}),
        })
        return suggestions.flatMap(s => s.placePrediction ? [{
          kind, id: 'p' + s.placePrediction.placeId,
          title: s.placePrediction.mainText?.text ?? s.placePrediction.text.text,
          sub: s.placePrediction.secondaryText?.text ?? '', pred: s.placePrediction,
        }] : []).slice(0, 6)
      } catch {
        // Places API (New) key par enable nahi — Geocoder use karo
        placesBroken.current = true
      }
    }
    if (!geocoderBroken.current) {
      try {
        const { results } = await new google.maps.Geocoder().geocode({ address: text, componentRestrictions: { country: 'IN' } })
        const areaOnly = isArea ? results.filter(g => g.types.some(t => AREA_TYPES.includes(t))) : results
        return (areaOnly.length ? areaOnly : results).slice(0, 6).map(g => {
          const [first, ...rest] = g.formatted_address.split(', ')
          return { kind, id: 'g' + g.place_id, title: first, sub: rest.join(', '), geo: g }
        })
      } catch (e) {
        // ZERO_RESULTS asli "kuch nahi mila" hai; baaki (REQUEST_DENIED wagaira) = API band
        if ((e as { code?: string })?.code === 'ZERO_RESULTS') return []
        geocoderBroken.current = true
      }
    }
    return fetchPhoton(text)
  }

  // OpenStreetMap search — free, key nahi chahiye; type karte-karte suggestions ke liye bana hai
  async function fetchPhoton(text: string): Promise<Hit[]> {
    const kind = isArea ? 'area' as const : 'place' as const
    const c = map?.getCenter()
    const p = new URLSearchParams({ q: text, limit: '8', lang: 'en', bbox: INDIA_BBOX })
    if (c) { p.set('lat', String(c.lat())); p.set('lon', String(c.lng())) }
    // Area box me sirf locality/sector/city/district — PIN code (sirf number) par filter mat lagao
    if (isArea && !/^\d{3,6}$/.test(text)) ['city', 'district', 'locality', 'county', 'state'].forEach(l => p.append('layer', l))
    const res = await fetch(PHOTON + '?' + p)
    if (!res.ok) throw new Error('Photon ' + res.status)
    const { features } = await res.json() as { features: PhotonFeature[] }
    const seen = new Set<string>()
    return features.flatMap(f => {
      const pr = f.properties
      const title = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ') || pr.postcode || ''
      if (!title) return []
      const sub = [pr.name ? pr.street : null, pr.district, pr.city, pr.state, pr.postcode].filter((v, i, a) => v && v !== title && a.indexOf(v) === i).join(', ')
      const key = (title + '|' + sub).toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      const [lng, lat] = f.geometry.coordinates
      return [{ kind, id: 'o' + pr.osm_type + pr.osm_id, title, sub, osm: { lat, lng, extent: pr.extent } }]
    }).slice(0, 6)
  }

  async function choose(h: Hit) {
    if (!map) return
    setOpen(false)
    setQ(h.title)
    input.current?.blur()
    if (h.kind === 'rider') {
      pin.current?.setMap(null)
      const l = h.rider.location!
      map.panTo({ lat: l.lat, lng: l.lng })
      if ((map.getZoom() ?? 12) < 15) map.setZoom(15)
      onRider?.(h.rider)
      return
    }
    let loc: google.maps.LatLng | null | undefined
    let vp: google.maps.LatLngBounds | null | undefined
    try {
      if (h.pred) {
        const place = h.pred.toPlace()
        await place.fetchFields({ fields: ['location', 'viewport'] })
        loc = place.location; vp = place.viewport
        token.current = null // session khatam — agli search naya token
      } else if (h.geo) {
        loc = h.geo.geometry.location; vp = h.geo.geometry.viewport
      } else if (h.osm) {
        loc = new google.maps.LatLng(h.osm.lat, h.osm.lng)
        const e = h.osm.extent
        if (e) vp = new google.maps.LatLngBounds({ lat: e[3], lng: e[0] }, { lat: e[1], lng: e[2] })
      }
    } catch { setNote('Could not open that place.'); setOpen(true); return }
    if (!loc) return

    if (isArea) {
      // Viewport na mile to point ke charon taraf ~1.5 km ka area maano
      const bounds = vp ?? new google.maps.Circle({ center: loc, radius: AREA_FALLBACK_RADIUS_M }).getBounds()!
      shape.current ??= new google.maps.Rectangle({
        clickable: false, strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 2,
        fillColor: '#2563eb', fillOpacity: 0.07, zIndex: 1,
      })
      shape.current.setOptions({ map, bounds })
      map.fitBounds(bounds, 48)
      setArea({ name: h.title, bounds })
      return
    }

    if (vp) map.fitBounds(vp, 40); else map.panTo(loc)
    if ((map.getZoom() ?? 12) > 16) map.setZoom(16)
    pin.current ??= new google.maps.Marker({ zIndex: 950 })
    pin.current.setOptions({
      map, position: loc, title: h.title,
      icon: { url: markerSvg('#2563eb', '•'), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 41) },
    })
  }

  function clear() {
    setQ(''); setHits([]); setNote(null); setOpen(false); setArea(null)
    pin.current?.setMap(null)
    shape.current?.setMap(null)
    input.current?.focus()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); choose(hits[active]) }
    else if (e.key === 'Escape') { if (open) setOpen(false); else clear() }
  }

  // Chune hue area me abhi kya chal raha hai — har poll par khud update hota hai
  const stats = useMemo(() => {
    if (!area) return null
    const inside = (p?: { lat: number; lng: number } | null) => !!p && area.bounds.contains(p)
    const busyIds = new Set(orders.map(o => o.rider?._id).filter(Boolean))
    const here = riders.filter(r => inside(r.location))
    return {
      riders: here.length,
      busy: here.filter(r => busyIds.has(r._id)).length,
      orders: orders.filter(o => inside(o.pickup?.coordinates) || inside(o.delivery?.coordinates)).length,
    }
  }, [area, riders, orders])

  const showList = open && q.trim().length >= 2 && (hits.length > 0 || !!note || loading)

  return (
    <div className={'map-search ' + (isArea ? 'map-search-right' : 'map-search-left') + (showList ? ' is-open' : '')} ref={box}>
      <div className="map-search-field">
        {isArea ? <IconMap className="map-search-icon" /> : <IconSearch className="map-search-icon" />}
        <input
          ref={input} value={q} disabled={!map}
          placeholder={isArea ? 'Search area, city or PIN code…' : 'Search a location or rider…'}
          aria-label={isArea ? 'Search area' : 'Search location'} role="combobox" aria-expanded={showList} aria-autocomplete="list"
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        {loading && <span className="btn-spinner map-search-spin" />}
        {q && <button className="map-search-clear" onClick={clear} aria-label="Clear search"><IconX width={15} height={15} /></button>}
      </div>
      {showList && (
        <ul className="map-search-list" role="listbox">
          {isArea && hits.length > 0 && <li className="map-search-head">Areas</li>}
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(h)}>
                <span className={'map-search-ico ' + h.kind}>
                  {h.kind === 'rider' ? <IconBike width={15} height={15} /> : h.kind === 'area' ? <IconMap width={15} height={15} /> : <IconPin width={15} height={15} />}
                </span>
                <span className="map-search-txt">
                  <span className="map-search-title">{h.title}</span>
                  {h.sub && <span className="map-search-sub">{h.sub}</span>}
                </span>
              </button>
            </li>
          ))}
          {note && !loading && <li className="map-search-note">{note}</li>}
          {loading && !hits.length && <li className="map-search-note">Searching…</li>}
        </ul>
      )}
      {!showList && area && stats && (
        <div className="map-area-sum">
          <div className="map-area-name">Showing <b>{area.name}</b></div>
          <div className="map-area-stats">
            <span><b>{stats.riders}</b> riders</span>
            <span><b>{stats.riders - stats.busy}</b> free</span>
            <span><b>{stats.busy}</b> on delivery</span>
            <span><b>{stats.orders}</b> active orders</span>
          </div>
        </div>
      )}
    </div>
  )
}
