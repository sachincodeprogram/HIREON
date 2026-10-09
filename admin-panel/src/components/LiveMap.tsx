/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react'
import type { LiveRider, Order } from '../api'
import { DARK_STYLE, LIGHT_STYLE, loadGoogleMaps, mapsAuthFailed, markerSvg, onMapsAuthFailure, riderSvg } from '../maps'
import { ago } from '../format'

const STALE_MS = 5 * 60_000
const DEFAULT_CENTER = { lat: 28.4744, lng: 77.504 } // Greater Noida

export type RiderState = 'available' | 'busy' | 'stale'
export const riderState = (r: LiveRider, busy: boolean): RiderState => {
  if (!r.location || Date.now() - new Date(r.location.updatedAt).getTime() > STALE_MS) return 'stale'
  return busy ? 'busy' : 'available'
}
const COLORS: Record<RiderState, string> = { available: '#0ca30c', busy: '#2a78d6', stale: '#8790a3' }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export default function LiveMap({ riders, orders, selected, onSelectOrder, theme }: {
  riders: LiveRider[]; orders: Order[]; selected: Order | null; onSelectOrder: (id: string) => void; theme: 'light' | 'dark'
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const riderMarkers = useRef(new Map<string, google.maps.Marker>())
  const orderLayer = useRef<(google.maps.Marker | google.maps.Polyline)[]>([])
  const info = useRef<google.maps.InfoWindow | null>(null)
  const fittedFor = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const selectRef = useRef(onSelectOrder)
  selectRef.current = onSelectOrder

  // Map ek baar banao
  useEffect(() => {
    let alive = true
    const off = onMapsAuthFailure(() => setError('Google rejected the Maps key. Enable “Maps JavaScript API” for this key in Google Cloud Console.'))
    loadGoogleMaps()
      .then(gm => {
        if (!alive || !el.current) return
        if (mapsAuthFailed()) { setError('Google rejected the Maps key. Enable “Maps JavaScript API” for this key in Google Cloud Console.'); return }
        map.current = new gm.Map(el.current, {
          center: DEFAULT_CENTER, zoom: 12, disableDefaultUI: true, zoomControl: true, fullscreenControl: true,
          clickableIcons: false, gestureHandling: 'greedy', styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
          backgroundColor: theme === 'dark' ? '#0a0d14' : '#f6f7f9',
        })
        // Key me "Maps JavaScript API" allowed na ho (ApiTargetBlockedMapError) to Google
        // gm_authFailure nahi bulata — sirf tiles nahi aati. 10s me tiles na aayein to batao.
        const tileTimer = setTimeout(() => {
          if (alive) setError('Map tiles did not load. In Google Cloud Console, allow “Maps JavaScript API” on this API key (APIs & Services → Credentials → key → API restrictions).')
        }, 10_000)
        gm.event.addListenerOnce(map.current, 'tilesloaded', () => clearTimeout(tileTimer))
        info.current = new gm.InfoWindow()
        // InfoWindow ke andar "View order" link
        info.current.addListener('domready', () => {
          document.querySelectorAll<HTMLButtonElement>('[data-order-link]').forEach(b => {
            b.onclick = () => { selectRef.current(b.dataset.orderLink!); info.current?.close() }
          })
        })
        setReady(true)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => { alive = false; off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { map.current?.setOptions({ styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE }) }, [theme, ready])

  // Riders ke markers — har poll par jagah update karo, naye/purane add/remove
  useEffect(() => {
    if (!ready || !map.current) return
    const busyBy = new Map(orders.filter(o => o.rider).map(o => [o.rider!._id, o]))
    const seen = new Set<string>()
    for (const r of riders) {
      if (!r.location) continue
      seen.add(r._id)
      const order = busyBy.get(r._id)
      const st = riderState(r, !!order)
      const isSel = !!selected && selected.rider?._id === r._id
      const icon = { url: riderSvg(COLORS[st], isSel ? '#f5a524' : '#ffffff'), scaledSize: new google.maps.Size(isSel ? 40 : 30, isSel ? 40 : 30), anchor: new google.maps.Point(isSel ? 20 : 15, isSel ? 20 : 15) }
      let m = riderMarkers.current.get(r._id)
      if (!m) {
        m = new google.maps.Marker({ map: map.current })
        riderMarkers.current.set(r._id, m)
      }
      m.setPosition({ lat: r.location.lat, lng: r.location.lng })
      m.setIcon(icon)
      m.setZIndex(isSel ? 1000 : st === 'busy' ? 500 : 100)
      m.setTitle(r.name)
      google.maps.event.clearListeners(m, 'click')
      m.addListener('click', () => {
        const status = st === 'stale' ? 'Location not updated recently' : st === 'busy' ? 'On a delivery' : 'Available'
        info.current?.setContent(
          '<div class="map-info"><div class="map-info-title">' + esc(r.name) + '</div>' +
          '<div class="map-info-sub">' + esc([r.vehicleType, r.vehicleNumber].filter(Boolean).join(' · ') || 'Rider') + '</div>' +
          '<div class="map-info-row"><span class="map-dot" style="background:' + COLORS[st] + '"></span>' + status + '</div>' +
          '<div class="map-info-sub">Updated ' + esc(ago(r.location!.updatedAt)) + (r.phone ? ' · ' + esc(r.phone) : '') + '</div>' +
          (order ? '<button class="map-info-btn" data-order-link="' + order._id + '">View order ' + esc(order.orderId) + '</button>' : '') +
          '</div>')
        info.current?.open({ map: map.current!, anchor: m })
      })
    }
    for (const [id, m] of riderMarkers.current) {
      if (!seen.has(id)) { m.setMap(null); riderMarkers.current.delete(id) }
    }
  }, [riders, orders, selected, ready])

  // Selected order: pickup/drop pins + route lines
  useEffect(() => {
    if (!ready || !map.current) return
    orderLayer.current.forEach(x => x.setMap(null))
    orderLayer.current = []
    if (!selected) { fittedFor.current = null; return }
    const p = selected.pickup?.coordinates, d = selected.delivery?.coordinates
    const bounds = new google.maps.LatLngBounds()
    const add = <T extends google.maps.Marker | google.maps.Polyline>(x: T) => { orderLayer.current.push(x); return x }
    if (p) {
      add(new google.maps.Marker({ map: map.current, position: p, zIndex: 900, title: 'Pickup', icon: { url: markerSvg('#0ca30c', 'P'), scaledSize: new google.maps.Size(36, 44), anchor: new google.maps.Point(18, 43) } }))
      bounds.extend(p)
    }
    if (d) {
      add(new google.maps.Marker({ map: map.current, position: d, zIndex: 900, title: 'Drop', icon: { url: markerSvg('#d03b3b', 'D'), scaledSize: new google.maps.Size(36, 44), anchor: new google.maps.Point(18, 43) } }))
      bounds.extend(d)
    }
    if (p && d) {
      add(new google.maps.Polyline({ map: map.current, path: [p, d], strokeColor: '#2a78d6', strokeOpacity: 0.55, strokeWeight: 3, geodesic: true }))
    }
    const r = selected.rider ? riders.find(x => x._id === selected.rider!._id) : null
    if (r?.location) {
      const pos = { lat: r.location.lat, lng: r.location.lng }
      const target = selected.status === 'accepted' ? p : d
      if (target) {
        add(new google.maps.Polyline({
          map: map.current, path: [pos, target], strokeOpacity: 0, geodesic: true,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#f5a524', strokeWeight: 3, scale: 3 }, offset: '0', repeat: '12px' }],
        }))
      }
      bounds.extend(pos)
    }
    // Sirf naya order select hone par zoom karo — har poll par map na kude
    if (fittedFor.current !== selected._id && !bounds.isEmpty()) {
      map.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
      fittedFor.current = selected._id
    }
  }, [selected, riders, ready])

  // Kuch select na ho to sab riders dikhao (pehli baar)
  const fittedAll = useRef(false)
  useEffect(() => {
    if (!ready || !map.current || selected || fittedAll.current) return
    const pts = riders.filter(r => r.location).map(r => ({ lat: r.location!.lat, lng: r.location!.lng }))
    if (!pts.length) return
    const b = new google.maps.LatLngBounds()
    pts.forEach(x => b.extend(x))
    map.current.fitBounds(b, 80)
    if ((map.current.getZoom() ?? 12) > 14) map.current.setZoom(14)
    fittedAll.current = true
  }, [riders, selected, ready])

  return (
    <div className="livemap">
      <div ref={el} className="livemap-canvas" />
      {!ready && !error && <div className="livemap-overlay"><span className="btn-spinner" /> Loading map…</div>}
      {error && (
        <div className="livemap-overlay livemap-error">
          <div className="strong">Map unavailable</div>
          <div className="muted small">{error}</div>
          <div className="muted small">Tracking details on the left still work.</div>
        </div>
      )}
      <div className="map-legend">
        <span><i style={{ background: COLORS.available }} />Available</span>
        <span><i style={{ background: COLORS.busy }} />On delivery</span>
        <span><i style={{ background: COLORS.stale }} />No recent GPS</span>
        <span><i className="sq" style={{ background: '#0ca30c' }} />Pickup</span>
        <span><i className="sq" style={{ background: '#d03b3b' }} />Drop</span>
      </div>
    </div>
  )
}
