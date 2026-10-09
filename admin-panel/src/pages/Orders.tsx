import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Order } from '../api'
import { useData, ordersCapped } from '../data'
import { useDetail } from '../nav'
import { DAY, downloadCsv, startOfDay, toCsv } from '../analytics'
import { dateTime, money, num, orderFare, STATUSES, statusLabel } from '../format'
import {
  Avatar, Card, Empty, ErrorBox, Notice, PageHeader, Pagination, Pill, Segmented, Select, SkeletonRows, SortTh,
  StatusBadge, useSortedPaged,
} from '../components/ui'
import { IconDownload, IconSearch, IconX } from '../components/icons'

type DateRange = 'all' | 'today' | '7' | '30'
type Pay = 'all' | 'COD' | 'ONLINE'
type SortKey = 'created' | 'fare' | 'distance' | 'status' | 'customer'

const sorters: Record<SortKey, (o: Order) => string | number> = {
  created: o => o.createdAt,
  fare: o => orderFare(o),
  distance: o => o.fare?.distance || 0,
  status: o => STATUSES.indexOf(o.status),
  customer: o => (o.customer?.name ?? '').toLowerCase(),
}

export default function Orders() {
  const d = useData()
  const { openOrder } = useDetail()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const [q, setQ] = useState('')
  const [range, setRange] = useState<DateRange>('all')
  const [pay, setPay] = useState<Pay>('all')

  const setStatus = (s: string) => setParams(prev => {
    const p = new URLSearchParams(prev)
    if (s === 'all') p.delete('status'); else p.set('status', s)
    return p
  })

  // Date + payment + search pehle; status counts inhi par based hon
  const base = useMemo(() => {
    const n = q.trim().toLowerCase()
    const from = range === 'all' ? 0 : range === 'today' ? startOfDay(Date.now()) : startOfDay(Date.now()) - (Number(range) - 1) * DAY
    return d.orders.filter(o =>
      (!from || new Date(o.createdAt).getTime() >= from) &&
      (pay === 'all' || (o.paymentMethod ?? 'COD') === pay) &&
      (!n || [o.orderId, o.customer?.name, o.customer?.phone, o.rider?.name, o.rider?.phone, o.pickup?.address, o.delivery?.address]
        .some(v => v?.toLowerCase().includes(n))))
  }, [d.orders, q, range, pay])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length }
    for (const s of STATUSES) c[s] = 0
    for (const o of base) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [base])

  const rows = useMemo(() => (status === 'all' ? base : base.filter(o => o.status === status)), [base, status])
  const t = useSortedPaged<Order, SortKey>(rows, sorters, { key: 'created', dir: 'desc' })
  const loading = d.loading && !d.lastUpdated
  const filtered = q || range !== 'all' || pay !== 'all'

  const exportCsv = () => downloadCsv('hireon-orders-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(t.sorted.map(o => ({
    order_id: o.orderId,
    created_at: o.createdAt,
    status: o.status,
    customer: o.customer?.name,
    customer_phone: o.customer?.phone,
    rider: o.rider?.name,
    rider_phone: o.rider?.phone,
    pickup: o.pickup?.address,
    drop: o.delivery?.address,
    distance_km: o.fare?.distance,
    fare_estimated: o.fare?.estimated,
    fare_final: o.fare?.final,
    payment_method: o.paymentMethod,
    payment_status: o.paymentStatus,
    rider_earning: o.riderEarning,
    cancelled_by: o.cancelledBy,
  }))))

  return (
    <>
      <PageHeader title="Orders" subtitle={loading ? 'Loading orders…' : num(d.ordersTotal) + ' parcels booked on HIREON'}>
        <button className="btn" onClick={exportCsv} disabled={!t.total}><IconDownload /> Export CSV</button>
      </PageHeader>

      {d.error && <ErrorBox message={d.error} onRetry={d.refresh} />}
      {ordersCapped(d) && <Notice>Showing the latest {num(d.orders.length)} of {num(d.ordersTotal)} orders.</Notice>}

      <Card flush>
        <div className="table-toolbar">
          <Segmented value={status} onChange={setStatus}
            options={[{ value: 'all', label: 'All', count: counts.all }, ...STATUSES.map(s => ({ value: s, label: statusLabel[s]!, count: counts[s] }))]} />
          <div className="toolbar-row">
            <label className="search">
              <IconSearch />
              <input placeholder="Search order ID, name, phone, address…" value={q} onChange={e => setQ(e.target.value)} />
              {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear"><IconX /></button>}
            </label>
            <Select label="Date" value={range} onChange={setRange} options={[
              { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' },
            ]} />
            <Select label="Payment" value={pay} onChange={setPay} options={[
              { value: 'all', label: 'All' }, { value: 'COD', label: 'Cash (COD)' }, { value: 'ONLINE', label: 'Online' },
            ]} />
            {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setRange('all'); setPay('all') }}>Reset</button>}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <SortTh k="customer" sort={t.sort} onSort={t.toggle}>Customer</SortTh>
                <th>Rider</th>
                <th>Route</th>
                <SortTh k="status" sort={t.sort} onSort={t.toggle}>Status</SortTh>
                <th>Payment</th>
                <SortTh k="distance" sort={t.sort} onSort={t.toggle} num>Distance</SortTh>
                <SortTh k="fare" sort={t.sort} onSort={t.toggle} num>Fare</SortTh>
                <SortTh k="created" sort={t.sort} onSort={t.toggle} num>Created</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows cols={9} /> : t.pageRows.map(o => (
                <tr key={o._id} className="clickable" onClick={() => openOrder(o._id)}>
                  <td className="mono">{o.orderId || o._id.slice(-6)}</td>
                  <td><div className="strong-ish">{o.customer?.name ?? '—'}</div><div className="muted small">{o.customer?.phone}</div></td>
                  <td>{o.rider ? <span className="user-cell"><Avatar name={o.rider.name} size={24} />{o.rider.name}</span> : <span className="muted">Unassigned</span>}</td>
                  <td className="route-cell">
                    <div className="route-line"><span className="rd rd-pick" /><span className="truncate">{o.pickup?.address}</span></div>
                    <div className="route-line"><span className="rd rd-drop" /><span className="truncate muted">{o.delivery?.address}</span></div>
                  </td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>
                    <div className="pay-cell">
                      <span>{o.paymentMethod ?? 'COD'}</span>
                      <Pill tone={o.paymentStatus === 'paid' ? 'good' : o.paymentStatus === 'failed' ? 'bad' : 'neutral'}>{o.paymentStatus ?? 'pending'}</Pill>
                    </div>
                  </td>
                  <td className="num muted">{o.fare?.distance ? o.fare.distance.toFixed(1) + ' km' : '—'}</td>
                  <td className="num strong-ish">{money(orderFare(o))}</td>
                  <td className="num muted nowrap">{dateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && t.total === 0 && <Empty title="No orders found">{filtered || status !== 'all' ? 'Try a different filter or search.' : 'Orders will appear here once customers book.'}</Empty>}
        </div>
        {t.total > 0 && <Pagination page={t.page} pages={t.pages} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />}
      </Card>
    </>
  )
}
