import { useMemo } from 'react'
import { useData, ordersCapped } from '../data'
import { useDetail } from '../nav'
import { deliveredTime } from '../analytics'
import { money, num, orderFare } from '../format'
import { BarList, Columns } from '../components/charts'
import { Avatar, Card, Empty, ErrorBox, Kpi, Notice, PageHeader } from '../components/ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FARE_BUCKETS = [
  { label: '< ₹50', max: 50 }, { label: '₹50–100', max: 100 }, { label: '₹100–200', max: 200 },
  { label: '₹200–500', max: 500 }, { label: '₹500+', max: Infinity },
]

const fmtDuration = (mins: number) => mins < 60 ? Math.round(mins) + ' min' : (mins / 60).toFixed(1) + ' hr'

export default function Analytics() {
  const d = useData()
  const { openUser } = useDetail()
  const loading = d.loading && !d.lastUpdated

  const a = useMemo(() => {
    const os = d.orders
    const delivered = os.filter(o => o.status === 'delivered')
    const cancelled = os.filter(o => o.status === 'cancelled')
    const closed = delivered.length + cancelled.length

    const hours = Array.from({ length: 24 }, () => 0)
    const weekdays = Array.from({ length: 7 }, () => 0)
    for (const o of os) {
      const t = new Date(o.createdAt)
      hours[t.getHours()]!++
      weekdays[(t.getDay() + 6) % 7]!++
    }

    // Pichhle 6 mahine
    const months = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(); dt.setDate(1); dt.setHours(0, 0, 0, 0); dt.setMonth(dt.getMonth() - (5 - i))
      return { key: dt.getFullYear() * 12 + dt.getMonth(), label: dt.toLocaleDateString('en-IN', { month: 'short' }), full: dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), orders: 0, revenue: 0, delivered: 0 }
    })
    const mi = (t: Date) => months.findIndex(m => m.key === t.getFullYear() * 12 + t.getMonth())
    for (const o of os) {
      const i = mi(new Date(o.createdAt))
      if (i >= 0) months[i]!.orders++
      if (o.status === 'delivered') {
        const j = mi(new Date(deliveredTime(o)))
        if (j >= 0) { months[j]!.delivered++; months[j]!.revenue += orderFare(o) }
      }
    }

    const fares = FARE_BUCKETS.map(b => ({ ...b, count: 0 }))
    for (const o of delivered) {
      const f = orderFare(o)
      fares.find(b => f < b.max)!.count++
    }

    const durations = delivered
      .map(o => (deliveredTime(o) - new Date(o.createdAt).getTime()) / 60000)
      .filter(m => m > 0 && m < 24 * 60)
      .sort((x, y) => x - y)
    const median = durations.length ? durations[Math.floor(durations.length / 2)]! : null

    const whoMap = new Map<string, number>()
    for (const o of cancelled) {
      const k = o.cancelledBy || 'unknown'
      whoMap.set(k, (whoMap.get(k) ?? 0) + 1)
    }
    const stage = { beforeRider: 0, afterRider: 0 }
    for (const o of cancelled) {
      const hadRider = !!o.rider || (o.timeline ?? []).some(t => t.status === 'accepted')
      stage[hadRider ? 'afterRider' : 'beforeRider']++
    }

    const cust = new Map<string, { name: string; orders: number; value: number }>()
    for (const o of os) {
      if (!o.customer) continue
      const c = cust.get(o.customer._id) ?? { name: o.customer.name, orders: 0, value: 0 }
      c.orders++
      if (o.status === 'delivered') c.value += orderFare(o)
      cust.set(o.customer._id, c)
    }

    const revenue = delivered.reduce((s, o) => s + orderFare(o), 0)
    const distances = delivered.map(o => o.fare?.distance || 0).filter(Boolean)
    const riderPay = delivered.reduce((s, o) => s + (o.riderEarning || 0), 0)

    return {
      delivered: delivered.length, cancelled: cancelled.length, closed,
      cancelRate: closed ? (cancelled.length / closed) * 100 : null,
      avgFare: delivered.length ? revenue / delivered.length : 0,
      avgDistance: distances.length ? distances.reduce((s, x) => s + x, 0) / distances.length : 0,
      median, revenue, riderPay,
      hours, weekdays, months, fares,
      who: [...whoMap.entries()].sort((x, y) => y[1] - x[1]),
      stage,
      topCustomers: [...cust.entries()].sort((x, y) => y[1].orders - x[1].orders).slice(0, 6),
    }
  }, [d.orders])

  const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? 'a' : 'p')

  return (
    <>
      <PageHeader title="Analytics" subtitle="Demand patterns, fares and cancellations across all orders" />

      {d.error && <ErrorBox message={d.error} onRetry={d.refresh} />}
      {ordersCapped(d) && <Notice>Based on the latest {num(d.orders.length)} of {num(d.ordersTotal)} orders.</Notice>}

      <div className="kpi-grid">
        <Kpi loading={loading} label="Delivered revenue" value={money(a.revenue)} hint={num(a.delivered) + ' delivered orders'} />
        <Kpi loading={loading} label="Platform share" value={money(a.revenue - a.riderPay)}
          hint={a.riderPay ? money(a.riderPay) + ' paid to riders' : 'rider earnings not recorded'} />
        <Kpi loading={loading} label="Average fare" value={money(a.avgFare)} hint={a.avgDistance ? a.avgDistance.toFixed(1) + ' km average trip' : ''} />
        <Kpi loading={loading} label="Median delivery time" value={a.median === null ? '—' : fmtDuration(a.median)} hint="booking → delivered" />
        <Kpi loading={loading} label="Cancellation rate" value={a.cancelRate === null ? '—' : a.cancelRate.toFixed(0) + '%'}
          hint={num(a.cancelled) + ' of ' + num(a.closed) + ' closed orders'} />
      </div>

      <div className="grid grid-2">
        <Card title="Monthly trend" subtitle="Orders booked per month (hover for revenue)">
          {loading ? <div className="chart-skel skeleton" /> : (
            <Columns points={a.months.map(m => ({
              label: m.label, value: m.orders,
              tooltip: <><div className="strong">{m.full}</div><div>{num(m.orders)} orders · {num(m.delivered)} delivered</div><div>{money(m.revenue)} revenue</div></>,
            }))} />
          )}
        </Card>
        <Card title="Fare distribution" subtitle="Delivered orders by fare">
          {loading ? <div className="chart-skel skeleton" /> : (
            <Columns color="var(--series-3)" points={a.fares.map(f => ({
              label: f.label, value: f.count,
              tooltip: <><div className="strong">{f.label}</div><div>{num(f.count)} orders</div></>,
            }))} />
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Busiest hours" subtitle="Orders by hour of day">
          {loading ? <div className="chart-skel skeleton" /> : (
            <Columns labelEvery={3} points={a.hours.map((n, h) => ({
              label: hourLabel(h), value: n,
              tooltip: <><div className="strong">{hourLabel(h)}m – {hourLabel((h + 1) % 24)}m</div><div>{num(n)} orders</div></>,
            }))} />
          )}
        </Card>
        <Card title="Busiest days" subtitle="Orders by day of week">
          {loading ? <div className="chart-skel skeleton" /> : (
            <Columns points={a.weekdays.map((n, i) => ({
              label: WEEKDAYS[i]!, value: n,
              tooltip: <><div className="strong">{WEEKDAYS[i]}</div><div>{num(n)} orders</div></>,
            }))} />
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Why orders get cancelled" subtitle="Who cancelled, and when">
          {a.cancelled === 0 ? <Empty>No cancellations.</Empty> : <>
            <BarList color="var(--st-crit)" format={num} rows={a.who.map(([k, n]) => ({
              key: k, label: k === 'unknown' ? 'Not recorded' : 'By ' + k, value: n,
            }))} />
            <div className="split-stats">
              <div><div className="ministat-value">{num(a.stage.beforeRider)}</div><div className="muted small">before a rider accepted</div></div>
              <div><div className="ministat-value">{num(a.stage.afterRider)}</div><div className="muted small">after a rider was assigned</div></div>
            </div>
          </>}
        </Card>
        <Card title="Top customers" subtitle="By number of orders">
          {a.topCustomers.length === 0 ? <Empty>No orders yet.</Empty> : (
            <BarList format={n => num(n) + ' orders'} rows={a.topCustomers.map(([id, c]) => ({
              key: id,
              label: <button className="inline-person" onClick={() => openUser(id)}><Avatar name={c.name} size={22} /> {c.name}</button>,
              value: c.orders,
              sub: money(c.value) + ' delivered value',
            }))} />
          )}
        </Card>
      </div>
    </>
  )
}
