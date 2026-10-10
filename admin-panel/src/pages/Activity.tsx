import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type SVGProps } from 'react'
import { api, ApiError, type ActivityEvent } from '../api'
import { useAuth } from '../auth'
import { useData } from '../data'
import { useDetail } from '../nav'
import { ago, dateTime, money } from '../format'
import { Card, Empty, ErrorBox, MiniStat, PageHeader, Pill, Segmented } from '../components/ui'
import { IconBan, IconBike, IconBox, IconCheck, IconPin, IconRupee, IconShield, IconUsers, IconX } from '../components/icons'

// Live Activity — app me jo bhi ho raha hai (order, signup, rider duty, block) wo yahan
// har 10 second me aata hai. Sirf naye events maange jaate hain (since=last), poora list nahi.
const POLL_MS = 10_000
const MAX_EVENTS = 500

type Filter = 'all' | 'orders' | 'riders' | 'signups' | 'moderation'
type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
interface View { title: string; detail: string; tone: Tone; icon: (p: SVGProps<SVGSVGElement>) => ReactElement }

const matches = (e: ActivityEvent, f: Filter) =>
  f === 'all' ||
  (f === 'orders' && e.type === 'order') ||
  (f === 'riders' && (e.type === 'rider_online' || e.type === 'rider_offline')) ||
  (f === 'signups' && e.type === 'signup') ||
  (f === 'moderation' && (e.type === 'block' || e.type === 'unblock'))

function describe(e: ActivityEvent): View {
  const o = e.order
  const who = (r?: { name: string } | null, fallback = 'Someone') => r?.name || fallback
  switch (e.type) {
    case 'signup':
      return { title: `New ${e.user?.role ?? 'user'} signed up`, detail: who(e.user), tone: 'info', icon: IconUsers }
    case 'block':
      return { title: `${who(e.user)} was blocked`, detail: e.reason || 'No reason given', tone: 'bad', icon: IconBan }
    case 'unblock':
      return { title: `${who(e.user)} was unblocked`, detail: e.reason || 'Access restored', tone: 'good', icon: IconShield }
    case 'rider_online':
      return { title: `${who(e.user, 'A rider')} went online`, detail: 'Available for new orders', tone: 'good', icon: IconBike }
    case 'rider_offline':
      return { title: `${who(e.user, 'A rider')} went offline`, detail: 'Stopped taking orders', tone: 'neutral', icon: IconBike }
  }
  const id = o?.orderId ?? 'Order'
  const fare = o ? money(o.fare.final || o.fare.estimated) : ''
  if (/payment/i.test(e.note ?? '')) return { title: `Payment received for ${id}`, detail: `${fare} · paid online`, tone: 'good', icon: IconRupee }
  switch (e.status) {
    case 'pending':
      return { title: `${who(o?.customer, 'A customer')} placed ${id}`, detail: `${fare} · ${o?.paymentMethod === 'ONLINE' ? 'Online' : 'Cash'} · ${o?.pickup ?? ''} → ${o?.delivery ?? ''}`, tone: 'warn', icon: IconBox }
    case 'accepted':
      return { title: `${who(o?.rider, 'A rider')} accepted ${id}`, detail: `Heading to pickup · ${o?.pickup ?? ''}`, tone: 'info', icon: IconBike }
    case 'picked_up':
      return { title: `${id} picked up`, detail: `${who(o?.rider, 'Rider')} is on the way to ${o?.delivery ?? 'the drop'}`, tone: 'info', icon: IconPin }
    case 'in_transit':
      return { title: `${id} in transit`, detail: e.note || '', tone: 'info', icon: IconPin }
    case 'delivered':
      if (/rating/i.test(e.note ?? '')) return { title: `${id} rated`, detail: `${who(o?.customer, 'Customer')}: ${e.note?.replace(/^Customer ne\s*/i, '').replace(/rating di$/i, 'rating')}`, tone: 'good', icon: IconCheck }
      return { title: `${id} delivered`, detail: `${who(o?.rider, 'Rider')} delivered to ${who(o?.customer, 'the customer')} · ${fare}`, tone: 'good', icon: IconCheck }
    case 'cancelled':
      return { title: `${id} cancelled`, detail: e.note || 'Order cancelled', tone: 'bad', icon: IconX }
    default:
      return { title: `${id} updated`, detail: e.note || e.status || '', tone: 'neutral', icon: IconBox }
  }
}

const dayLabel = (s: string) => {
  const d = new Date(s)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })
}

export default function Activity() {
  const { logout } = useAuth()
  const data = useData()
  const { openOrder, openUser } = useDetail()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastPoll, setLastPoll] = useState<number | null>(null)
  const [, tick] = useState(0)
  const newest = useRef<string | undefined>(undefined)
  const busy = useRef(false)
  const seen = useRef(new Set<string>())
  const lastDataRefresh = useRef(0)
  const { refresh: refreshData } = data

  const poll = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      // 2s overlap — same timestamp wale events miss na hon; id se duplicate hata do
      const since = newest.current ? new Date(new Date(newest.current).getTime() - 2000).toISOString() : undefined
      const res = await api.activity(since)
      setError(null)
      setLastPoll(Date.now())
      if (res.events.length) newest.current = res.events[0].at > (newest.current ?? '') ? res.events[0].at : newest.current
      const firstLoad = seen.current.size === 0
      const added = res.events.filter(e => !seen.current.has(e.id))
      if (added.length) {
        added.forEach(e => seen.current.add(e.id))
        if (!firstLoad) {
          setFresh(new Set(added.map(e => e.id)))
          // Naya order/user aaya — baaki panel (drawers, tables) ka cache bhi taaza karo, max har 20s
          if (Date.now() - lastDataRefresh.current > 20_000) { lastDataRefresh.current = Date.now(); refreshData() }
        }
        setEvents(prev => [...added, ...prev].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_EVENTS))
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { logout(); return }
      setError(e instanceof Error ? e.message : 'Could not load activity')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [logout, refreshData])

  useEffect(() => { poll() }, [poll])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') poll() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [paused, poll])

  // "5m ago" labels taaza rakho
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  // Highlight thodi der baad hata do
  useEffect(() => {
    if (!fresh.size) return
    const t = setTimeout(() => setFresh(new Set()), 6000)
    return () => clearTimeout(t)
  }, [fresh])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: events.length, orders: 0, riders: 0, signups: 0, moderation: 0 }
    for (const e of events) (['orders', 'riders', 'signups', 'moderation'] as const).forEach(f => { if (matches(e, f)) c[f]++ })
    return c
  }, [events])

  const hour = useMemo(() => {
    const from = new Date(Date.now() - 3_600_000).toISOString()
    const recent = events.filter(e => e.at >= from)
    return {
      orders: recent.filter(e => e.type === 'order' && e.status === 'pending').length,
      delivered: recent.filter(e => e.type === 'order' && e.status === 'delivered' && !/rating/i.test(e.note ?? '')).length,
      signups: recent.filter(e => e.type === 'signup').length,
      online: data.riders.filter(r => r.isOnline && !r.isBlocked).length,
    }
  }, [events, data.riders])

  const groups = useMemo(() => {
    const out: { label: string; items: ActivityEvent[] }[] = []
    for (const e of events.filter(x => matches(x, filter))) {
      const label = dayLabel(e.at)
      const g = out[out.length - 1]
      if (g && g.label === label) g.items.push(e)
      else out.push({ label, items: [e] })
    }
    return out
  }, [events, filter])

  const open = (e: ActivityEvent) => {
    if (e.order) openOrder(e.order._id)
    else if (e.user) openUser(e.user._id)
  }

  return (
    <>
      <PageHeader
        title="Live activity"
        subtitle={<>Everything happening in the app, as it happens. {lastPoll ? 'Checked ' + ago(new Date(lastPoll).toISOString()) : ''}</>}
      >
        <span className={'live-chip' + (paused ? ' live-chip-paused' : '')}>
          <span className={paused ? 'dot-paused' : 'dot-live pulse'} /> {paused ? 'Paused' : 'Live'}
        </span>
        <button className="btn btn-sm" onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</button>
      </PageHeader>

      <div className="ministats activity-stats">
        <MiniStat label="New orders · last hour" value={hour.orders} />
        <MiniStat label="Delivered · last hour" value={hour.delivered} />
        <MiniStat label="Signups · last hour" value={hour.signups} />
        <MiniStat label="Riders online now" value={hour.online} />
      </div>

      {error && <ErrorBox message={error} onRetry={poll} />}

      <Card
        title="Activity feed"
        subtitle="Last 24 hours · updates every 10 seconds"
        action={
          <Segmented<Filter> value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'orders', label: 'Orders', count: counts.orders },
            { value: 'riders', label: 'Riders', count: counts.riders },
            { value: 'signups', label: 'Signups', count: counts.signups },
            { value: 'moderation', label: 'Blocks', count: counts.moderation },
          ]} />
        }
      >
        {loading ? (
          <div className="activity-list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="activity-row"><span className="skeleton skeleton-lg" style={{ width: '60%' }} /></div>)}</div>
        ) : groups.length === 0 ? (
          <Empty title="Nothing yet">New orders, signups and rider activity will show up here as they happen.</Empty>
        ) : (
          groups.map(g => (
            <div key={g.label} className="activity-group">
              <div className="activity-day">{g.label}</div>
              <ul className="activity-list">
                {g.items.map(e => {
                  const v = describe(e)
                  const Icon = v.icon
                  return (
                    <li key={e.id} className={'activity-row' + (fresh.has(e.id) ? ' activity-new' : '')} onClick={() => open(e)} tabIndex={0}
                      onKeyDown={k => { if (k.key === 'Enter') open(e) }}>
                      <span className={'activity-icon tone-' + v.tone}><Icon /></span>
                      <div className="activity-body">
                        <div className="activity-title">{v.title}{fresh.has(e.id) && <Pill tone="info">new</Pill>}</div>
                        {v.detail && <div className="muted small activity-detail">{v.detail}</div>}
                      </div>
                      <time className="muted small activity-time" title={dateTime(e.at)}>{ago(e.at)}</time>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </Card>
      <p className="muted small activity-foot">Rider online/offline events are kept in server memory and reset when the server restarts.</p>
    </>
  )
}
