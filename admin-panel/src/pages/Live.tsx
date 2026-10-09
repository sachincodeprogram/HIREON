import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type LiveData, type Order } from '../api'
import { useAuth } from '../auth'
import { useDetail } from '../nav'
import { ago, dateTime, money, num, orderFare, statusLabel } from '../format'
import { etaMinutes, kmBetween } from '../maps'
import LiveMap, { riderState } from '../components/LiveMap'
import { Avatar, CopyButton, ErrorBox, Segmented, StatusBadge } from '../components/ui'
import { IconChevronLeft, IconExternal, IconPin, IconRefresh, IconSearch, IconX } from '../components/icons'

const POLL_MS = 10_000
type Tab = 'all' | 'searching' | 'to_pickup' | 'to_drop'
type Lang = 'en' | 'hi'

const tabOf = (o: Order): Tab =>
  o.status === 'pending' ? 'searching' : o.status === 'accepted' ? 'to_pickup' : 'to_drop'

interface Progress { km: number | null; eta: number | null; target: 'pickup' | 'drop' | null; fresh: boolean; updatedAt?: string }

function progressOf(o: Order, data: LiveData | null): Progress {
  const r = o.rider && data?.riders.find(x => x._id === o.rider!._id)
  const target = o.status === 'accepted' ? 'pickup' : o.status === 'picked_up' || o.status === 'in_transit' ? 'drop' : null
  const dest = target === 'pickup' ? o.pickup?.coordinates : target === 'drop' ? o.delivery?.coordinates : undefined
  if (!r || !r.location || !dest || !target) return { km: null, eta: null, target, fresh: false, updatedAt: r ? r.location?.updatedAt : undefined }
  const km = kmBetween(r.location, dest)
  return { km, eta: etaMinutes(km), target, fresh: riderState(r, true) !== 'stale', updatedAt: r.location.updatedAt }
}

function customerMessage(o: Order, p: Progress, lang: Lang) {
  const name = o.customer?.name?.split(' ')[0] || (lang === 'hi' ? 'ग्राहक' : 'there')
  const rider = o.rider?.name ?? ''
  const vehicle = [o.rider?.vehicleType, o.rider?.vehicleNumber].filter(Boolean).join(' ')
  const dist = p.km !== null ? (p.km < 1 ? Math.round(p.km * 1000) + (lang === 'hi' ? ' मीटर' : ' m') : p.km.toFixed(1) + ' km') : null
  const eta = p.eta !== null ? '~' + p.eta + (lang === 'hi' ? ' मिनट' : ' min') : null
  const phone = o.rider?.phone ? (lang === 'hi' ? '\nराइडर का नंबर: ' : '\nRider contact: ') + o.rider.phone : ''
  const ref = (lang === 'hi' ? '\nऑर्डर: ' : '\nOrder: ') + o.orderId

  if (lang === 'hi') {
    if (o.status === 'pending') return `नमस्ते ${name}, HIREON पर आपके ऑर्डर के लिए हम आपके पिकअप के पास राइडर ढूंढ रहे हैं। राइडर मिलते ही आपको सूचना मिल जाएगी।${ref}`
    if (o.status === 'accepted') return `नमस्ते ${name}, आपके HIREON राइडर ${rider}${vehicle ? ' (' + vehicle + ')' : ''} पिकअप लोकेशन की ओर आ रहे हैं${dist ? ` — लगभग ${dist} दूर, ${eta} में पहुँचेंगे` : ''}।${phone}${ref}`
    return `नमस्ते ${name}, आपका पार्सल राइडर ${rider}${vehicle ? ' (' + vehicle + ')' : ''} ने उठा लिया है और डिलीवरी के रास्ते में है${dist ? ` — ड्रॉप लोकेशन से लगभग ${dist} दूर, ${eta} में पहुँचेगा` : ''}।${phone}${ref}`
  }
  if (o.status === 'pending') return `Hi ${name}, we're finding a HIREON rider near your pickup location. You'll be notified as soon as a rider accepts your order.${ref}`
  if (o.status === 'accepted') return `Hi ${name}, your HIREON rider ${rider}${vehicle ? ' (' + vehicle + ')' : ''} is on the way to the pickup location${dist ? ` — about ${dist} away, arriving in ${eta}` : ''}.${phone}${ref}`
  return `Hi ${name}, your parcel has been picked up by ${rider}${vehicle ? ' (' + vehicle + ')' : ''} and is on the way${dist ? ` — about ${dist} from the drop location, arriving in ${eta}` : ''}.${phone}${ref}`
}

export default function Live() {
  const { logout } = useAuth()
  const { openOrder } = useDetail()
  const [params, setParams] = useSearchParams()
  const selId = params.get('track')
  const [data, setData] = useState<LiveData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState<Lang>('en')
  const [, tick] = useState(0)
  const busy = useRef(false)
  const theme = (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as 'light' | 'dark'

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const d = await api.live()
      setData(d)
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { logout(); return }
      setError(e instanceof Error ? e.message : 'Failed to load live data')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [logout])

  useEffect(() => {
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const t2 = setInterval(() => tick(x => x + 1), 5000)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [load])

  const select = useCallback((id: string | null) => setParams(prev => {
    const p = new URLSearchParams(prev)
    if (id) p.set('track', id); else p.delete('track')
    return p
  }), [setParams])

  const orders = useMemo(() => data?.orders ?? [], [data])
  const selected = selId ? orders.find(o => o._id === selId) ?? null : null
  const counts = useMemo(() => {
    const c = { all: orders.length, searching: 0, to_pickup: 0, to_drop: 0 }
    orders.forEach(o => c[tabOf(o)]++)
    return c
  }, [orders])
  const busyRiderIds = new Set(orders.map(o => o.rider?._id).filter(Boolean))
  const riders = data?.riders ?? []
  const available = riders.filter(r => r.isOnline && !r.isBlocked && riderState(r, false) === 'available' && !busyRiderIds.has(r._id)).length
  const staleCount = riders.filter(r => riderState(r, false) === 'stale').length

  const needle = q.trim().toLowerCase()
  const list = orders.filter(o => (tab === 'all' || tabOf(o) === tab) &&
    (!needle || [o.orderId, o.customer?.name, o.customer?.phone, o.rider?.name, o.rider?.phone].some(v => v?.toLowerCase().includes(needle))))

  return (
    <div className="live">
      <div className="live-head">
        <div>
          <h1>Live tracking</h1>
          <p className="muted">Where every active parcel and on-duty rider is right now</p>
        </div>
        <div className="live-stats">
          <div className="live-stat"><span className="live-stat-v">{num(counts.all)}</span><span className="muted small">Active orders</span></div>
          <div className="live-stat warn"><span className="live-stat-v">{num(counts.searching)}</span><span className="muted small">Finding rider</span></div>
          <div className="live-stat good"><span className="live-stat-v">{num(available)}</span><span className="muted small">Riders available</span></div>
          <div className="live-stat"><span className="live-stat-v">{num(staleCount)}</span><span className="muted small">No recent GPS</span></div>
          <button className="btn" onClick={load} disabled={loading}><IconRefresh className={loading ? 'spin' : ''} /> {data ? 'Updated ' + ago(data.serverTime) : 'Loading…'}</button>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      <div className="live-body">
        <aside className="live-panel">
          {selected ? (
            <TrackDetail order={selected} progress={progressOf(selected, data)} lang={lang} setLang={setLang}
              onBack={() => select(null)} onOpen={() => openOrder(selected._id)} />
          ) : (
            <>
              <div className="live-panel-tools">
                <Segmented value={tab} onChange={setTab} options={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'searching', label: 'Finding', count: counts.searching },
                  { value: 'to_pickup', label: 'To pickup', count: counts.to_pickup },
                  { value: 'to_drop', label: 'To drop', count: counts.to_drop },
                ]} />
                <label className="search">
                  <IconSearch />
                  <input placeholder="Order ID, customer, rider, phone…" value={q} onChange={e => setQ(e.target.value)} />
                  {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear"><IconX /></button>}
                </label>
              </div>
              <ul className="live-list">
                {!data && Array.from({ length: 5 }, (_, i) => <li key={i} className="live-item"><span className="skeleton" /><span className="skeleton" style={{ width: '50%' }} /></li>)}
                {list.map(o => {
                  const p = progressOf(o, data)
                  return (
                    <li key={o._id}>
                      <button className="live-item" onClick={() => select(o._id)}>
                        <div className="live-item-top">
                          <span className="mono small">{o.orderId}</span>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="live-item-who">
                          <span className="strong">{o.customer?.name ?? '—'}</span>
                          <span className="muted"> · {o.rider ? o.rider.name : 'no rider yet'}</span>
                        </div>
                        <div className="live-item-meta muted small">
                          {o.status === 'pending'
                            ? 'Waiting ' + ago(o.createdAt).replace(' ago', '')
                            : p.km !== null
                              ? p.km.toFixed(1) + ' km to ' + p.target + ' · ~' + p.eta + ' min' + (p.fresh ? '' : ' · GPS old')
                              : 'Rider location unknown'}
                          <span>{money(orderFare(o))}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
                {data && list.length === 0 && (
                  <li className="live-empty">
                    <div className="empty-title">{orders.length ? 'No matches' : 'No active orders'}</div>
                    <div className="muted small">{orders.length ? 'Try another filter.' : 'New orders will show up here automatically.'}</div>
                  </li>
                )}
              </ul>
            </>
          )}
        </aside>
        <LiveMap riders={riders} orders={orders} selected={selected} onSelectOrder={id => select(id)} theme={theme} />
      </div>
    </div>
  )
}

function TrackDetail({ order: o, progress: p, lang, setLang, onBack, onOpen }: {
  order: Order; progress: Progress; lang: Lang; setLang: (l: Lang) => void; onBack: () => void; onOpen: () => void
}) {
  const msg = customerMessage(o, p, lang)
  const steps = ['pending', 'accepted', 'picked_up', 'in_transit'] as const
  const idx = steps.indexOf(o.status as typeof steps[number])
  const map = o.pickup?.coordinates && o.delivery?.coordinates
    ? 'https://www.google.com/maps/dir/?api=1&origin=' + o.pickup.coordinates.lat + ',' + o.pickup.coordinates.lng + '&destination=' + o.delivery.coordinates.lat + ',' + o.delivery.coordinates.lng
    : null

  return (
    <div className="track">
      <div className="track-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><IconChevronLeft /> All orders</button>
        <button className="link small" onClick={onOpen}>Full details</button>
      </div>

      <div className="track-title">
        <span className="mono">{o.orderId}</span><CopyButton text={o.orderId} />
        <StatusBadge status={o.status} />
      </div>
      <div className="muted small">Booked {dateTime(o.createdAt)} · {money(orderFare(o))} · {o.paymentMethod ?? 'COD'}</div>

      <ol className="track-steps">
        {steps.map((s, i) => (
          <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''}><span />{s === 'pending' ? 'Booked' : statusLabel[s]}</li>
        ))}
      </ol>

      <div className={'eta-card' + (o.status === 'pending' ? ' eta-wait' : '')}>
        {o.status === 'pending' ? (
          <>
            <div className="eta-big">Finding a rider</div>
            <div className="muted small">Waiting {ago(o.createdAt).replace(' ago', '')} · riders nearby are being notified</div>
          </>
        ) : p.km !== null ? (
          <>
            <div className="eta-big">~{p.eta} min <span className="muted">to {p.target}</span></div>
            <div className="small">{p.km < 1 ? Math.round(p.km * 1000) + ' m' : p.km.toFixed(1) + ' km'} away (straight-line estimate)</div>
            <div className={'small ' + (p.fresh ? 'muted' : 'warn-text')}>
              {p.fresh ? 'GPS updated ' + ago(p.updatedAt) : 'Last GPS ' + ago(p.updatedAt) + ' — rider app may be in background'}
            </div>
          </>
        ) : (
          <>
            <div className="eta-big">Location unavailable</div>
            <div className="muted small">The rider’s app hasn’t shared GPS yet. Call the rider for an update.</div>
          </>
        )}
      </div>

      <div className="track-people">
        <Contact label="Customer" name={o.customer?.name} phone={o.customer?.phone} />
        {o.rider
          ? <Contact label={'Rider' + (o.rider.vehicleNumber ? ' · ' + o.rider.vehicleNumber : '')} name={o.rider.name} phone={o.rider.phone} />
          : <div className="contact muted small">No rider assigned yet</div>}
      </div>

      <div className="track-route">
        <div className="route-line"><span className="route-dot pickup sm"><IconPin /></span><div><div className="muted small">Pickup</div>{o.pickup?.address}</div></div>
        <div className="route-line"><span className="route-dot drop sm"><IconPin /></span><div><div className="muted small">Drop</div>{o.delivery?.address}</div></div>
        {map && <a className="link small" href={map} target="_blank" rel="noopener noreferrer">Open route in Google Maps <IconExternal /></a>}
      </div>

      <div className="msg-card">
        <div className="msg-head">
          <span className="strong">Update for customer</span>
          <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }]} />
        </div>
        <p className="msg-text">{msg}</p>
        <div className="msg-actions">
          <CopyMessage text={msg} />
          {o.customer?.phone && (
            <a className="btn btn-sm" href={'https://wa.me/' + waNumber(o.customer.phone) + '?text=' + encodeURIComponent(msg)} target="_blank" rel="noopener noreferrer">
              Send on WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// 10 digit Indian number ho to 91 lagao — wa.me ko country code chahiye
const waNumber = (phone: string) => {
  const d = phone.replace(/D/g, '')
  return d.length === 10 ? '91' + d : d
}

function Contact({ label, name, phone }: { label: string; name?: string; phone?: string }) {
  return (
    <div className="contact">
      <Avatar name={name} size={34} />
      <div className="person-main">
        <div className="muted small">{label}</div>
        <div className="strong">{name ?? '—'}</div>
      </div>
      {phone && <a className="btn btn-sm" href={'tel:' + phone}>Call</a>}
    </div>
  )
}

function CopyMessage({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button className="btn btn-primary btn-sm" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
    }}>{done ? 'Copied ✓' : 'Copy message'}</button>
  )
}
