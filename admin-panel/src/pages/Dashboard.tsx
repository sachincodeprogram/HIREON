import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData, ordersCapped } from '../data'
import { useDetail } from '../nav'
import { DAY, dailySeries, isActive, periodTotals, pctChange, startOfDay } from '../analytics'
import { ago, money, num, orderFare, statusLabel } from '../format'
import { AreaChart, BarList, SegmentBar, Sparkline } from '../components/charts'
import { Avatar, Card, Empty, ErrorBox, Kpi, Notice, PageHeader, Segmented, StatusBadge } from '../components/ui'

type Range = '7' | '30' | '90'
type Metric = 'orders' | 'revenue'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const d = useData()
  const { openOrder, openUser } = useDetail()
  const [range, setRange] = useState<Range>('7')
  const [metric, setMetric] = useState<Metric>('orders')
  const days = Number(range)
  const loading = d.loading && !d.lastUpdated

  const m = useMemo(() => {
    const end = startOfDay(Date.now()) + DAY
    const cur = periodTotals(d.orders, end - days * DAY, end)
    const prev = periodTotals(d.orders, end - 2 * days * DAY, end - days * DAY)
    const rate = (p: typeof cur) => (p.delivered + p.cancelled ? (p.delivered / (p.delivered + p.cancelled)) * 100 : null)
    const series = dailySeries(d.orders, days)
    const spark = dailySeries(d.orders, 14)

    const counts = { pending: 0, progress: 0, delivered: 0, cancelled: 0 }
    for (const o of d.orders) {
      if (o.status === 'pending') counts.pending++
      else if (isActive(o)) counts.progress++
      else if (o.status === 'delivered') counts.delivered++
      else counts.cancelled++
    }

    const from = end - days * DAY
    const inRange = d.orders.filter(o => new Date(o.createdAt).getTime() >= from)
    const pay = { COD: 0, ONLINE: 0 }
    for (const o of inRange) if (o.status === 'delivered') pay[o.paymentMethod === 'ONLINE' ? 'ONLINE' : 'COD'] += orderFare(o)

    const riderMap = new Map<string, { name: string; count: number; value: number }>()
    for (const o of inRange) {
      if (o.status !== 'delivered' || !o.rider) continue
      const r = riderMap.get(o.rider._id) ?? { name: o.rider.name, count: 0, value: 0 }
      r.count++
      r.value += orderFare(o)
      riderMap.set(o.rider._id, r)
    }
    const topRiders = [...riderMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5)

    const activity = d.orders
      .flatMap(o => [
        { o, status: 'pending', t: o.createdAt },
        ...(o.timeline ?? []).filter(t => t.status !== 'pending').map(t => ({ o, status: t.status, t: t.timestamp })),
      ])
      .sort((a, b) => (a.t < b.t ? 1 : -1))
      .slice(0, 8)

    return { cur, prev, rate: rate(cur), prevRate: rate(prev), series, spark, counts, pay, topRiders, activity }
  }, [d.orders, days])

  const online = d.riders.filter(r => r.isOnline).length
  const rateDelta = m.rate !== null && m.prevRate !== null ? m.rate - m.prevRate : null
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const compact = (n: number) => '₹' + (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : Math.round(n))

  return (
    <>
      <PageHeader title={greeting() + ', Admin'}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · here’s how HIREON is doing'}>
        <Segmented value={range} onChange={setRange}
          options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </PageHeader>

      {d.error && <ErrorBox message={d.error} onRetry={d.refresh} />}
      {ordersCapped(d) && <Notice>Analytics use the latest {num(d.orders.length)} of {num(d.ordersTotal)} orders.</Notice>}

      <div className="kpi-grid">
        <Kpi loading={loading} label="Orders" value={num(m.cur.orders)} delta={pctChange(m.cur.orders, m.prev.orders)}
          hint={'vs previous ' + days + 'd'} chart={<Sparkline values={m.spark.map(p => p.orders)} />} />
        <Kpi loading={loading} label="Delivered revenue" value={money(m.cur.revenue)} delta={pctChange(m.cur.revenue, m.prev.revenue)}
          hint={'vs previous ' + days + 'd'} chart={<Sparkline values={m.spark.map(p => p.revenue)} />} />
        <Kpi loading={loading} label="Completion rate" value={m.rate === null ? '—' : m.rate.toFixed(0) + '%'}
          hint={rateDelta === null ? 'delivered ÷ closed orders' : (rateDelta >= 0 ? '+' : '') + rateDelta.toFixed(1) + ' pts vs previous'} />
        <Kpi loading={loading} label="Active orders" value={num(d.stats?.orders.active)}
          hint={num(m.counts.pending) + ' waiting for a rider'} />
        <Kpi loading={loading} label="Riders online" value={<>{num(online)}<span className="kpi-of">/{num(d.stats?.users.riders)}</span></>}
          hint={num(d.stats?.users.customers) + ' customers registered'} />
      </div>

      <div className="grid grid-main">
        <Card title={metric === 'orders' ? 'Orders over time' : 'Delivered revenue over time'}
          subtitle={'Last ' + days + ' days · total ' + (metric === 'orders' ? num(m.cur.orders) + ' orders' : money(m.cur.revenue))}
          action={<Segmented value={metric} onChange={setMetric} options={[{ value: 'orders', label: 'Orders' }, { value: 'revenue', label: 'Revenue' }]} />}>
          {loading ? <div className="chart-skel skeleton" /> : (
            <AreaChart
              height={300}
              integer={metric === 'orders'}
              color={metric === 'orders' ? 'var(--series-1)' : 'var(--series-3)'}
              format={metric === 'orders' ? (n => String(Math.round(n))) : compact}
              points={m.series.map(p => ({
                label: fmtDay(p.t),
                value: metric === 'orders' ? p.orders : p.revenue,
                tooltip: <>
                  <div className="strong">{new Date(p.t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div>{num(p.orders)} orders · {num(p.delivered)} delivered</div>
                  <div>{money(p.revenue)} revenue</div>
                  {p.cancelled > 0 && <div className="muted">{num(p.cancelled)} cancelled</div>}
                </>,
              }))} />
          )}
        </Card>

        <div className="stack">
          <Card title="Order pipeline" subtitle="All orders by current state">
            {loading ? <div className="skeleton block-skel" /> : (
              <SegmentBar format={num} segments={[
                { key: 'pending', label: 'Waiting for rider', value: m.counts.pending, color: 'var(--st-warn)' },
                { key: 'progress', label: 'In progress', value: m.counts.progress, color: 'var(--series-1)' },
                { key: 'delivered', label: 'Delivered', value: m.counts.delivered, color: 'var(--st-good)' },
                { key: 'cancelled', label: 'Cancelled', value: m.counts.cancelled, color: 'var(--st-crit)' },
              ]} />
            )}
          </Card>
          <Card title="Payment mix" subtitle={'Delivered revenue, last ' + days + ' days'}>
            {loading ? <div className="skeleton block-skel" /> : (
              <SegmentBar format={money} segments={[
                { key: 'cod', label: 'Cash on delivery', value: m.pay.COD, color: 'var(--series-1)' },
                { key: 'online', label: 'Online (Razorpay)', value: m.pay.ONLINE, color: 'var(--series-2)' },
              ]} />
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-3">
        <Card flush title="Recent orders" action={<Link to="/orders" className="link">View all →</Link>} className="span-2">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Order</th><th>Customer</th><th>Rider</th><th>Status</th><th className="num">Fare</th><th className="num">Created</th></tr></thead>
              <tbody>
                {d.orders.slice(0, 7).map(o => (
                  <tr key={o._id} className="clickable" onClick={() => openOrder(o._id)}>
                    <td className="mono">{o.orderId}</td>
                    <td>{o.customer?.name ?? '—'}</td>
                    <td>{o.rider?.name ?? <span className="muted">—</span>}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="num">{money(orderFare(o))}</td>
                    <td className="num muted">{ago(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && d.orders.length === 0 && <Empty title="No orders yet" />}
          </div>
        </Card>

        <Card title="Live activity" subtitle="Latest status changes">
          <ol className="feed">
            {m.activity.map((a, i) => (
              <li key={i} onClick={() => openOrder(a.o._id)}>
                <span className={'feed-dot feed-' + a.status} />
                <div className="feed-main">
                  <div><span className="mono small">{a.o.orderId}</span> <span className="muted">→</span> {a.status === 'pending' ? 'Booked' : statusLabel[a.status] ?? a.status}</div>
                  <div className="muted small">{a.o.customer?.name ?? '—'} · {ago(a.t)}</div>
                </div>
              </li>
            ))}
          </ol>
          {!loading && m.activity.length === 0 && <Empty title="Quiet so far" />}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Top riders" subtitle={'By deliveries, last ' + days + ' days'} action={<Link to="/riders" className="link">All riders →</Link>}>
          {m.topRiders.length === 0 ? <Empty>No deliveries in this period.</Empty> : (
            <BarList format={n => num(n) + ' deliveries'} rows={m.topRiders.map(([id, r]) => ({
              key: id,
              label: <button className="inline-person" onClick={() => openUser(id)}><Avatar name={r.name} size={22} /> {r.name}</button>,
              value: r.count,
              sub: money(r.value) + ' delivered value',
            }))} />
          )}
        </Card>
        <Card title="Newest riders" subtitle="Recently joined delivery partners" action={<Link to="/riders" className="link">All riders →</Link>}>
          <ul className="list">
            {d.riders.slice(0, 5).map(r => (
              <li key={r._id} className="list-row clickable" onClick={() => openUser(r._id)}>
                <Avatar name={r.name} src={r.avatar} />
                <div className="list-main">
                  <div className="strong">{r.name}</div>
                  <div className="muted small">{[r.vehicleType, r.phone].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="muted small">{ago(r.createdAt)}</span>
                <span className={'presence' + (r.isOnline ? ' on' : '')}>{r.isOnline ? 'Online' : 'Offline'}</span>
              </li>
            ))}
          </ul>
          {!loading && d.riders.length === 0 && <Empty>No riders yet.</Empty>}
        </Card>
      </div>
    </>
  )
}
