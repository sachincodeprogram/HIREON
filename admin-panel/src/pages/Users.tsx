import { useMemo, useState } from 'react'
import type { User } from '../api'
import { useData } from '../data'
import { useDetail } from '../nav'
import { downloadCsv, statsBy, toCsv, type PersonStats } from '../analytics'
import { ago, date, money, num } from '../format'
import {
  Avatar, Card, Empty, ErrorBox, Kpi, Notice, PageHeader, Pagination, Pill, Segmented, SkeletonRows, SortTh, useSortedPaged,
} from '../components/ui'
import { IconDownload, IconSearch, IconStar, IconX } from '../components/icons'

type RiderKey = 'name' | 'deliveries' | 'earnings' | 'rating' | 'joined'
type CustKey = 'name' | 'orders' | 'spend' | 'last' | 'joined'
type Filter = 'all' | 'online' | 'offline' | 'active' | 'inactive' | 'blocked' | 'deleted'

const EMPTY: PersonStats = { orders: 0, delivered: 0, cancelled: 0, spend: 0 }

export default function Users({ role }: { role: 'rider' | 'customer' }) {
  const d = useData()
  const { openUser } = useDetail()
  const isRider = role === 'rider'
  const people = isRider ? d.riders : d.customers
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const loading = d.loading && !d.lastUpdated

  const stats = useMemo(() => statsBy(d.orders, role), [d.orders, role])
  const st = (u: User) => stats.get(u._id) ?? EMPTY

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return people.filter(u => {
      if (n && ![u.name, u.phone, u.email, u.vehicleNumber].some(v => v?.toLowerCase().includes(n))) return false
      switch (filter) {
        case 'online': return !!u.isOnline
        case 'offline': return !u.isOnline
        case 'active': return (stats.get(u._id)?.orders ?? 0) > 0
        case 'inactive': return !(stats.get(u._id)?.orders)
        case 'blocked': return !!u.isBlocked
        case 'deleted': return !!u.deletedAt
        default: return true
      }
    })
  }, [people, q, filter, stats])

  const riderSort = useSortedPaged<User, RiderKey>(rows, {
    name: u => u.name.toLowerCase(), deliveries: u => u.totalDeliveries || 0, earnings: u => u.totalEarnings || 0,
    rating: u => u.rating ?? 5, joined: u => u.createdAt,
  }, { key: 'joined', dir: 'desc' })
  const custSort = useSortedPaged<User, CustKey>(rows, {
    name: u => u.name.toLowerCase(), orders: u => st(u).orders, spend: u => st(u).spend, last: u => st(u).last ?? '', joined: u => u.createdAt,
  }, { key: 'joined', dir: 'desc' })

  const online = d.riders.filter(r => r.isOnline).length
  const withOrders = d.customers.filter(c => stats.get(c._id)?.orders).length
  const totalEarn = d.riders.reduce((s, r) => s + (r.totalEarnings || 0), 0)
  const rated = d.riders.filter(r => r.ratingCount)
  const avgRating = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 5), 0) / rated.length : null
  const spend = [...stats.values()].reduce((s, x) => s + x.spend, 0)
  const newThisWeek = people.filter(u => Date.now() - new Date(u.createdAt).getTime() < 7 * 86_400_000).length

  const exportCsv = () => downloadCsv('hireon-' + role + 's-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(
    (isRider ? riderSort.sorted : custSort.sorted).map(u => isRider ? {
      name: u.name, phone: u.phone, email: u.email, vehicle_type: u.vehicleType, vehicle_number: u.vehicleNumber,
      online: u.isOnline, blocked: !!u.isBlocked, block_reason: u.blockReason ?? '', deliveries: u.totalDeliveries, earnings: u.totalEarnings, rating: u.rating, rating_count: u.ratingCount,
      joined: u.createdAt, deleted: u.deletedAt ?? '',
    } : {
      name: u.name, phone: u.phone, email: u.email, orders: st(u).orders, delivered: st(u).delivered,
      cancelled: st(u).cancelled, blocked: !!u.isBlocked, block_reason: u.blockReason ?? '', delivered_value: st(u).spend, last_order: st(u).last ?? '', joined: u.createdAt, deleted: u.deletedAt ?? '',
    })))

  const blockedCount = people.filter(p => p.isBlocked).length
  const filters: { value: Filter; label: string; count?: number }[] = isRider
    ? [{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }, { value: 'blocked', label: 'Blocked', count: blockedCount }, { value: 'deleted', label: 'Deleted' }]
    : [{ value: 'all', label: 'All' }, { value: 'active', label: 'Has ordered' }, { value: 'inactive', label: 'Never ordered' }, { value: 'blocked', label: 'Blocked', count: blockedCount }, { value: 'deleted', label: 'Deleted' }]

  const t = isRider ? riderSort : custSort

  return (
    <>
      <PageHeader title={isRider ? 'Riders' : 'Customers'}
        subtitle={isRider ? 'Delivery partners, their earnings and ratings' : 'People who book parcels on HIREON'}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}><IconDownload /> Export CSV</button>
      </PageHeader>

      {d.error && <ErrorBox message={d.error} onRetry={d.refresh} />}
      {d.usersCapped && <Notice>Showing the latest 1,000 accounts.</Notice>}

      <div className="kpi-grid kpi-grid-4">
        {isRider ? <>
          <Kpi loading={loading} label="Total riders" value={num(d.riders.length)} hint={num(newThisWeek) + ' joined this week'} />
          <Kpi loading={loading} label="Online now" value={<>{num(online)}<span className="kpi-of">/{num(d.riders.length)}</span></>} hint="available to accept orders" />
          <Kpi loading={loading} label="Total paid out" value={money(totalEarn)} hint="lifetime rider earnings" />
          <Kpi loading={loading} label="Average rating" value={avgRating ? avgRating.toFixed(2) + ' ★' : '—'} hint={num(rated.length) + ' riders rated'} />
        </> : <>
          <Kpi loading={loading} label="Total customers" value={num(d.customers.length)} hint={num(newThisWeek) + ' joined this week'} />
          <Kpi loading={loading} label="Have ordered" value={num(withOrders)} hint={d.customers.length ? Math.round((withOrders / d.customers.length) * 100) + '% of customers' : ''} />
          <Kpi loading={loading} label="Delivered value" value={money(spend)} hint="across all customers" />
          <Kpi loading={loading} label="Avg per customer" value={money(withOrders ? spend / withOrders : 0)} hint="among those who ordered" />
        </>}
      </div>

      <Card flush>
        <div className="table-toolbar">
          <Segmented value={filter} onChange={setFilter} options={filters} />
          <div className="toolbar-row">
            <label className="search">
              <IconSearch />
              <input placeholder={isRider ? 'Search name, phone, vehicle number…' : 'Search name, phone, email…'} value={q} onChange={e => setQ(e.target.value)} />
              {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear"><IconX /></button>}
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              {isRider ? (
                <tr>
                  <SortTh k="name" sort={riderSort.sort} onSort={riderSort.toggle}>Rider</SortTh>
                  <th>Contact</th><th>Vehicle</th>
                  <SortTh k="deliveries" sort={riderSort.sort} onSort={riderSort.toggle} num>Deliveries</SortTh>
                  <SortTh k="earnings" sort={riderSort.sort} onSort={riderSort.toggle} num>Earnings</SortTh>
                  <SortTh k="rating" sort={riderSort.sort} onSort={riderSort.toggle}>Rating</SortTh>
                  <SortTh k="joined" sort={riderSort.sort} onSort={riderSort.toggle} num>Joined</SortTh>
                </tr>
              ) : (
                <tr>
                  <SortTh k="name" sort={custSort.sort} onSort={custSort.toggle}>Customer</SortTh>
                  <th>Contact</th>
                  <SortTh k="orders" sort={custSort.sort} onSort={custSort.toggle} num>Orders</SortTh>
                  <SortTh k="spend" sort={custSort.sort} onSort={custSort.toggle} num>Delivered value</SortTh>
                  <SortTh k="last" sort={custSort.sort} onSort={custSort.toggle} num>Last order</SortTh>
                  <SortTh k="joined" sort={custSort.sort} onSort={custSort.toggle} num>Joined</SortTh>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? <SkeletonRows cols={isRider ? 7 : 6} /> : t.pageRows.map(u => (
                <tr key={u._id} className={'clickable' + (u.isBlocked ? ' row-blocked' : '')} onClick={() => openUser(u._id)}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar-wrap">
                        <Avatar name={u.name} src={u.avatar} size={34} />
                        {isRider && <span className={'presence-dot' + (u.isOnline ? ' on' : '')} />}
                      </span>
                      <div>
                        <div className="strong">{u.name}</div>
                        <div className="user-tags">
                          {isRider && <span className={'presence' + (u.isOnline ? ' on' : '')}>{u.isOnline ? 'Online' : 'Offline'}</span>}
                          {u.isBlocked && <Pill tone="bad">Blocked</Pill>}
                          {u.deletedAt && <Pill tone="bad">Deleted</Pill>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><div>{u.phone || <span className="muted">—</span>}</div><div className="muted small">{u.email}</div></td>
                  {isRider ? <>
                    <td>{u.vehicleType || <span className="muted">—</span>}<div className="muted small mono">{u.vehicleNumber}</div></td>
                    <td className="num">{num(u.totalDeliveries)}</td>
                    <td className="num strong-ish">{money(u.totalEarnings)}</td>
                    <td><span className="rating"><IconStar /> {(u.rating ?? 5).toFixed(1)}</span> <span className="muted small">({num(u.ratingCount)})</span></td>
                  </> : <>
                    <td className="num">{num(st(u).orders)}</td>
                    <td className="num strong-ish">{money(st(u).spend)}</td>
                    <td className="num muted">{st(u).last ? ago(st(u).last) : '—'}</td>
                  </>}
                  <td className="num muted nowrap">{date(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && t.total === 0 && <Empty title={q || filter !== 'all' ? 'No matches' : 'Nobody here yet'}>{q || filter !== 'all' ? 'Try a different search or filter.' : ''}</Empty>}
        </div>
        {t.total > 0 && <Pagination page={t.page} pages={t.pages} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />}
      </Card>
    </>
  )
}
