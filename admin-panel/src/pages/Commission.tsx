import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type CommissionData, type CommissionRow, type Pricing, type PricingAdmin, type PricingConfig } from '../api'
import { useAuth } from '../auth'
import { useDetail } from '../nav'
import { downloadCsv, toCsv } from '../analytics'
import { ago, dateTime, money, num, paise } from '../format'
import {
  Card, Drawer, Empty, ErrorBox, Field, Kpi, Notice, PageHeader, Pagination, Pill, Segmented, Select, SkeletonRows, SortTh,
  useSortedPaged,
} from '../components/ui'
import { IconDownload, IconExternal, IconRefresh, IconSearch, IconX } from '../components/icons'
import { describeChanges, FareLines, hourLabel, pctLabel, slabsText, SplitLines } from '../components/fare'
import PricingEditor, { configOf } from '../components/PricingEditor'

// Commission & charges — teen tab:
//  • Overview: delivered orders ka fare kaise bana, HIREON ne kitna rakha, rider ko kitna mila
//  • Pricing settings: rate card, distance slabs aur commission badlo (app me turant lagta hai)
//  • Change history: kab, kya aur kyun badla

type Tab = 'overview' | 'pricing' | 'history'
type Range = '7' | '30' | '90' | '0'
type Pay = 'all' | 'COD' | 'ONLINE'
type Settle = 'all' | 'settled' | 'missing'
type SortKey = 'delivered' | 'fare' | 'commission' | 'distance'

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0)
const commissionOf = (r: CommissionRow) => r.settlement?.commissionPaise ?? r.expectedCommissionPaise
const kmLabel = (km: number) => (km % 1 === 0 ? km : km.toFixed(2)) + ' km'

export default function Commission() {
  const { logout } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (['overview', 'pricing', 'history'].includes(params.get('tab') ?? '') ? params.get('tab') : 'overview') as Tab
  const setTab = useCallback((t: Tab) => setParams(prev => {
    const p = new URLSearchParams(prev)
    if (t === 'overview') p.delete('tab'); else p.set('tab', t)
    return p
  }), [setParams])

  // Pricing (settings + history) — teeno tab use karte hain
  const [pricing, setPricing] = useState<PricingAdmin | null>(null)
  const [pricingErr, setPricingErr] = useState<string | null>(null)
  const [seed, setSeed] = useState<{ config: PricingConfig; label: string; id: number } | null>(null)
  const loadPricing = useCallback(async () => {
    try {
      setPricing(await api.pricing())
      setPricingErr(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { logout(); return }
      setPricingErr(e instanceof Error ? e.message : 'Failed to load pricing')
    }
  }, [logout])
  useEffect(() => { loadPricing() }, [loadPricing])

  return (
    <>
      <PageHeader title="Commission & charges" subtitle="Set what customers pay and what HIREON keeps — changes apply to the app instantly">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'pricing', label: 'Pricing settings' },
          { value: 'history', label: 'Change history', count: pricing?.history.length || undefined },
        ]} />
      </PageHeader>

      {pricingErr && tab !== 'overview' && <ErrorBox message={pricingErr} onRetry={loadPricing} />}

      {tab === 'overview' && <Overview pricing={pricing?.pricing ?? null} onEdit={() => setTab('pricing')} />}

      {tab === 'pricing' && (pricing ? (
        <PricingEditor key={pricing.pricing.version + ':' + (seed?.id ?? 0)} data={pricing} seed={seed}
          onSaved={r => { setSeed(null); setPricing(p => (p ? { ...p, pricing: r.pricing, history: r.history } : p)) }} />
      ) : !pricingErr && <Card><SkeletonBlock /></Card>)}

      {tab === 'history' && pricing && (
        <History data={pricing} onLoad={(config, label) => { setSeed({ config, label, id: Date.now() }); setTab('pricing') }} />
      )}
    </>
  )
}

function SkeletonBlock() {
  return <div className="pf-skeleton">{Array.from({ length: 5 }, (_, i) => <span key={i} className="skeleton" />)}</div>
}

/* ---------------- Overview ---------------- */

function Overview({ pricing, onEdit }: { pricing: Pricing | null; onEdit: () => void }) {
  const { logout } = useAuth()
  const { openOrder } = useDetail()
  const [range, setRange] = useState<Range>('30')
  const [data, setData] = useState<CommissionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [pay, setPay] = useState<Pay>('all')
  const [settle, setSettle] = useState<Settle>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.commission(Number(range)))
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { logout(); return }
      setError(e instanceof Error ? e.message : 'Failed to load commission data')
    } finally {
      setLoading(false)
    }
  }, [range, logout])
  useEffect(() => { load() }, [load])

  const cfg = pricing ?? data?.config.pricing ?? null
  const all = useMemo(() => data?.rows ?? [], [data])

  const totals = useMemo(() => {
    const t = { fare: 0, commission: 0, missing: 0, missingCommission: 0, cod: { n: 0, fare: 0, commission: 0 }, online: { n: 0, fare: 0, commission: 0 } }
    for (const r of all) {
      const c = commissionOf(r)
      t.fare += r.farePaise
      t.commission += c
      if (!r.settlement) { t.missing++; t.missingCommission += c }
      const p = r.paymentMethod === 'ONLINE' ? t.online : t.cod
      p.n++; p.fare += r.farePaise; p.commission += c
    }
    return t
  }, [all])

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all.filter(r =>
      (pay === 'all' || r.paymentMethod === pay) &&
      (settle === 'all' || (settle === 'settled' ? !!r.settlement : !r.settlement)) &&
      (!n || [r.orderId, r.rider?.name, r.rider?.phone, r.customer?.name, r.customer?.phone].some(v => v?.toLowerCase().includes(n))))
  }, [all, q, pay, settle])

  const t = useSortedPaged<CommissionRow, SortKey>(rows, {
    delivered: r => r.deliveredAt ?? r.createdAt, fare: r => r.farePaise, commission: r => commissionOf(r), distance: r => r.breakdown.distanceKm,
  }, { key: 'delivered', dir: 'desc' })

  const filtered = !!q || pay !== 'all' || settle !== 'all'
  const firstLoad = loading && !data
  const selected = openId ? all.find(r => r._id === openId) ?? null : null

  const exportCsv = () => downloadCsv('hireon-commission-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(t.sorted.map(r => {
    const c = commissionOf(r)
    const sum = (k: string) => r.breakdown.lines.filter(l => l.key === k).reduce((s, l) => s + l.amount, 0)
    return {
      order_id: r.orderId, delivered_at: r.deliveredAt ?? '', rider: r.rider?.name, rider_phone: r.rider?.phone, customer: r.customer?.name,
      payment: r.paymentMethod, distance_km: r.breakdown.distanceKm, base_fare: sum('base'), distance_charge: sum('distance'),
      weight_charge: sum('weight'), size_charge: sum('size'), fragile_charge: sum('fragile'),
      night_surcharge: r.breakdown.nightCharge, rounding: r.breakdown.rounding, fare: r.farePaise / 100,
      commission: c / 100, commission_pct: pct(c, r.farePaise).toFixed(2), rider_net: (r.farePaise - c) / 100,
      pricing_version: r.pricingVersion ?? 'legacy', wallet_entry: r.settlement?.type ?? 'MISSING', wallet_entry_at: r.settlement?.at ?? '',
    }
  })))

  return (
    <>
      <div className="overview-tools">
        <Segmented value={range} onChange={setRange} options={[
          { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '0', label: 'All time' },
        ]} />
        <div className="overview-tools-right">
          <button className="btn" onClick={load} disabled={loading} title={data ? 'Updated ' + ago(data.serverTime) : undefined}><IconRefresh className={loading ? 'spin' : ''} /> Refresh</button>
          <button className="btn" onClick={exportCsv} disabled={!t.total}><IconDownload /> Export CSV</button>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {data?.capped && <Notice>Showing the latest {num(all.length)} delivered orders in this period.</Notice>}

      <div className="kpi-grid kpi-grid-4">
        <Kpi loading={firstLoad} label="Gross fare (GMV)" value={paise(totals.fare)} hint={num(all.length) + ' delivered orders'} />
        <Kpi loading={firstLoad} label="HIREON commission" value={paise(totals.commission)}
          hint={pctLabel(pct(totals.commission, totals.fare)) + ' effective · current rate ' + (cfg ? cfg.commissionPercent + '%' : '—')} />
        <Kpi loading={firstLoad} label="Rider earnings" value={paise(totals.fare - totals.commission)} hint={pctLabel(pct(totals.fare - totals.commission, totals.fare)) + ' of gross fare'} />
        <Kpi loading={firstLoad} label="Not settled" value={num(totals.missing)}
          hint={totals.missing ? paise(totals.missingCommission) + ' commission with no wallet entry' : 'every order has a wallet entry'} />
      </div>

      {cfg && (
        <div className="grid grid-2">
          <Card title="Current rate card" subtitle={cfg.isDefault ? 'Default rates — not customised yet' : 'Version ' + cfg.version + (cfg.updatedAt ? ' · updated ' + ago(cfg.updatedAt) : '')}
            action={<button className="btn btn-sm btn-primary" onClick={onEdit}>Edit pricing</button>}>
            <table className="table rate-table">
              <tbody>
                <tr><td>Base fare</td><td className="muted">every order</td><td className="num strong-ish">{money(cfg.baseFare)}</td></tr>
                {cfg.slabs.map((s, i) => {
                  const from = i ? cfg.slabs[i - 1]!.upToKm ?? 0 : 0
                  return <tr key={i}><td>{i ? '' : 'Distance'}</td><td className="muted">{s.upToKm === null ? (from ? `above ${from} km` : 'per km') : `${from}–${s.upToKm} km`}</td><td className="num strong-ish">{money(s.perKmRate)}/km</td></tr>
                })}
                <tr><td>Weight</td><td className="muted">per kg above {cfg.weightLimitKg} kg</td><td className="num strong-ish">{money(cfg.weightRate)}/kg</td></tr>
                <tr><td>Parcel size</td><td className="muted">small / medium / large</td><td className="num strong-ish">{money(cfg.sizeCharges.small)} / {money(cfg.sizeCharges.medium)} / {money(cfg.sizeCharges.large)}</td></tr>
                <tr><td>Fragile</td><td className="muted">if marked fragile</td><td className="num strong-ish">{money(cfg.fragileCharge)}</td></tr>
                <tr><td>Night</td><td className="muted">{cfg.nightEnabled ? `${hourLabel(cfg.nightStartHour)} – ${hourLabel(cfg.nightEndHour)} IST` : 'off'}</td><td className="num strong-ish">{cfg.nightEnabled ? '×' + cfg.nightMultiplier : '—'}</td></tr>
                <tr className="rate-key"><td>HIREON commission</td><td className="muted">of the fare, on delivery</td><td className="num">{cfg.commissionPercent}%</td></tr>
              </tbody>
            </table>
            <p className="muted small rate-foot">Minimum distance {cfg.minDistanceKm} km. Fare rounds to the nearest rupee.{data ? ' Riders can’t accept new COD orders once their wallet falls below ' + paise(data.config.walletMinBalancePaise) + '.' : ''}</p>
          </Card>

          <Card title="How commission is settled" subtitle="Applied automatically when an order is delivered">
            <div className="flow">
              <div className="flow-box">
                <h3><Pill>COD</Pill> Cash on delivery</h3>
                <ol>
                  <li>Customer pays the full fare in cash to the rider.</li>
                  <li>HIREON’s commission is <b>debited</b> from the rider’s wallet.</li>
                  <li>The wallet can go negative until the rider recharges.</li>
                </ol>
                <div className="flow-stats">
                  <span><b>{num(totals.cod.n)}</b> orders</span>
                  <span><b>{paise(totals.cod.fare)}</b> cash with riders</span>
                  <span><b>{paise(totals.cod.commission)}</b> commission</span>
                </div>
              </div>
              <div className="flow-box">
                <h3><Pill tone="info">Online</Pill> Paid via Razorpay</h3>
                <ol>
                  <li>Customer pays the fare online to HIREON.</li>
                  <li>Fare minus commission is <b>credited</b> to the rider’s wallet.</li>
                  <li>HIREON keeps the commission.</li>
                </ol>
                <div className="flow-stats">
                  <span><b>{num(totals.online.n)}</b> orders</span>
                  <span><b>{paise(totals.online.fare)}</b> collected</span>
                  <span><b>{paise(totals.online.fare - totals.online.commission)}</b> credited</span>
                </div>
              </div>
            </div>
            <p className="muted small rate-foot">Each order’s price and commission are locked when it is placed — changing pricing never affects orders already booked.</p>
          </Card>
        </div>
      )}

      <Card flush className="commission-orders">
        <div className="card-head"><div><h2>Order-wise breakdown</h2><div className="muted small">Click an order to see exactly how its charge was calculated</div></div></div>
        <div className="table-toolbar">
          <div className="toolbar-row">
            <label className="search">
              <IconSearch />
              <input placeholder="Search order ID, rider, customer, phone…" value={q} onChange={e => setQ(e.target.value)} />
              {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear"><IconX /></button>}
            </label>
            <Select label="Payment" value={pay} onChange={setPay} options={[{ value: 'all', label: 'All' }, { value: 'COD', label: 'Cash (COD)' }, { value: 'ONLINE', label: 'Online' }]} />
            <Select label="Wallet" value={settle} onChange={setSettle} options={[{ value: 'all', label: 'All' }, { value: 'settled', label: 'Settled' }, { value: 'missing', label: 'Not settled' }]} />
            {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setPay('all'); setSettle('all') }}>Reset</button>}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Rider</th>
                <th>Payment</th>
                <SortTh k="distance" sort={t.sort} onSort={t.toggle} num>Distance</SortTh>
                <SortTh k="fare" sort={t.sort} onSort={t.toggle} num>Fare</SortTh>
                <SortTh k="commission" sort={t.sort} onSort={t.toggle} num>Commission</SortTh>
                <th className="num">Rider earns</th>
                <th>Wallet</th>
                <SortTh k="delivered" sort={t.sort} onSort={t.toggle} num>Delivered</SortTh>
              </tr>
            </thead>
            <tbody>
              {firstLoad ? <SkeletonRows cols={9} /> : t.pageRows.map(r => {
                const c = commissionOf(r)
                return (
                  <tr key={r._id} className="clickable" onClick={() => setOpenId(r._id)}>
                    <td><div className="mono">{r.orderId || r._id.slice(-6)}</div><div className="muted small">{r.pricingVersion ? 'Pricing v' + r.pricingVersion : 'Legacy rates'}</div></td>
                    <td>{r.rider ? <><div className="strong-ish">{r.rider.name}</div><div className="muted small">{r.rider.phone}</div></> : <span className="muted">—</span>}</td>
                    <td>{r.paymentMethod === 'ONLINE' ? <Pill tone="info">Online</Pill> : <Pill>COD</Pill>}</td>
                    <td className="num muted">{kmLabel(r.breakdown.distanceKm)}</td>
                    <td className="num strong-ish">{paise(r.farePaise)}</td>
                    <td className="num"><div className="strong-ish">{paise(c)}</div><div className="muted small">{pctLabel(pct(c, r.farePaise))}</div></td>
                    <td className="num">{paise(r.farePaise - c)}</td>
                    <td>{r.settlement ? <Pill tone="good">{r.settlement.type === 'EARNING' ? 'Credited' : 'Debited'}</Pill> : <Pill tone="warn">Not settled</Pill>}</td>
                    <td className="num muted nowrap">{dateTime(r.deliveredAt ?? r.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!firstLoad && t.total === 0 && <Empty title="No delivered orders">{filtered ? 'Try a different filter or search.' : 'Delivered orders in this period will appear here.'}</Empty>}
        </div>
        {t.total > 0 && <Pagination page={t.page} pages={t.pages} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />}
      </Card>

      {selected && (
        <OrderCalc row={selected} onClose={() => setOpenId(null)} onOpenOrder={() => { setOpenId(null); openOrder(selected._id) }} />
      )}
    </>
  )
}

function OrderCalc({ row: r, onClose, onOpenOrder }: { row: CommissionRow; onClose: () => void; onOpenOrder: () => void }) {
  const c = commissionOf(r)
  const net = r.farePaise - c
  const appGap = Math.abs(r.appRiderEarning * 100 - net) >= 100
  const s = r.settlement
  return (
    <Drawer open title={<span className="mono">{r.orderId}</span>} subtitle={'Delivered ' + dateTime(r.deliveredAt ?? r.createdAt) + ' · ' + (r.paymentMethod === 'ONLINE' ? 'Paid online' : 'Cash on delivery')} onClose={onClose}>
      <section className="drawer-section">
        <h3 className="calc-head">Fare calculation {r.pricingVersion ? <Pill>Pricing v{r.pricingVersion}</Pill> : <Pill>Legacy rates</Pill>}</h3>
        <FareLines b={r.breakdown} />
        {r.breakdown.legacy && <p className="pf-note">Placed before editable pricing — reconstructed from the old fixed rates.</p>}
      </section>
      <section className="drawer-section">
        <h3 className="calc-head">Commission split</h3>
        <SplitLines farePaise={r.farePaise} commissionPaise={c} payment={r.paymentMethod} />
        {appGap && (
          <div className="notice notice-warn calc-warn">
            The rider app showed an earning of <b>{money(r.appRiderEarning)}</b> for this order, but the rider actually earned <b>{paise(net)}</b>.
          </div>
        )}
      </section>
      <section className="drawer-section">
        <h3 className="calc-head">Wallet entry</h3>
        {s ? (
          <dl className="fields">
            <Field label="Type">{s.type === 'EARNING' ? <Pill tone="good">Earning credited</Pill> : <Pill tone="good">Commission debited</Pill>}</Field>
            <Field label="Amount">{(s.type === 'EARNING' ? '+' : '−') + paise(s.amountPaise)}</Field>
            <Field label="Wallet balance after">{paise(s.balanceAfterPaise)}</Field>
            <Field label="Recorded">{dateTime(s.at)}</Field>
          </dl>
        ) : (
          <div className="notice notice-warn calc-warn">
            No wallet entry was recorded for this order. Expected: {r.paymentMethod === 'ONLINE' ? <>credit <b>{paise(net)}</b></> : <>debit <b>{paise(c)}</b></>} to {r.rider?.name ?? 'the rider'}’s wallet.
          </div>
        )}
      </section>
      <section className="drawer-section">
        <dl className="fields">
          <Field label="Rider">{r.rider ? <>{r.rider.name}<span className="muted small">{r.rider.phone}</span></> : ''}</Field>
          <Field label="Customer">{r.customer ? <>{r.customer.name}<span className="muted small">{r.customer.phone}</span></> : ''}</Field>
        </dl>
        <button className="btn calc-open" onClick={onOpenOrder}><IconExternal /> Open order details</button>
      </section>
    </Drawer>
  )
}

/* ---------------- History ---------------- */

function History({ data, onLoad }: { data: PricingAdmin; onLoad: (config: PricingConfig, label: string) => void }) {
  if (!data.history.length) {
    return <Card><Empty title="No pricing changes yet">The app is using the default rates ({slabsText(data.defaults.slabs)}, {data.defaults.commissionPercent}% commission). Changes you save in Pricing settings will be listed here.</Empty></Card>
  }
  return (
    <Card flush>
      <ol className="history">
        {data.history.map(h => {
          const changes = describeChanges(h.previous, h.config)
          const isCurrent = h.version === data.pricing.version
          return (
            <li key={h._id} className="history-item">
              <div className="history-dot" />
              <div className="history-main">
                <div className="history-head">
                  <b>Version {h.version}</b>
                  {isCurrent && <Pill tone="good">Live</Pill>}
                  <span className="muted small">{dateTime(h.createdAt)} · {ago(h.createdAt)}</span>
                </div>
                {h.note && <div className="history-note">“{h.note}”</div>}
                <ul className="history-changes">
                  {changes.map(c => <li key={c.label}><span className="muted">{c.label}:</span> <s className="muted">{c.from}</s> → <b>{c.to}</b></li>)}
                  {!changes.length && <li className="muted">No rate changes</li>}
                </ul>
              </div>
              {!isCurrent && <button className="btn btn-sm" onClick={() => onLoad(configOf(h.config), 'version ' + h.version)}>Load into editor</button>}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
