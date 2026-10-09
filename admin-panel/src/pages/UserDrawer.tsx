import { useState } from 'react'
import type { User } from '../api'
import { useData } from '../data'
import { useDetail } from '../nav'
import { isActive, ordersOf } from '../analytics'
import { date, dateTime, money, num, orderFare } from '../format'
import BlockDialog from '../components/BlockDialog'
import { Avatar, CopyButton, Drawer, Field, MiniStat, Pill, StatusBadge } from '../components/ui'
import { IconBan, IconShield, IconStar } from '../components/icons'

export default function UserDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { orders } = useData()
  const { openOrder } = useDetail()
  const [dialog, setDialog] = useState<'block' | 'unblock' | null>(null)
  if (!user) return null
  const u = user
  const isRider = u.role === 'rider'
  const mine = ordersOf(orders, u)
  const delivered = mine.filter(o => o.status === 'delivered')
  const cancelled = mine.filter(o => o.status === 'cancelled').length
  const activeCount = mine.filter(isActive).length
  const value = delivered.reduce((s, o) => s + orderFare(o), 0)
  // Sirf band ho chuke orders (delivered + cancelled) par — pending order se 0% dikhana galat hoga
  const closed = delivered.length + cancelled
  const completion = closed ? Math.round((delivered.length / closed) * 100) + '%' : '—'
  const history = [...(u.blockHistory ?? [])].reverse()

  return (
    <>
      <Drawer open onClose={onClose}
        title={<div className="user-cell"><Avatar name={u.name} src={u.avatar} size={40} /><div><div className="user-title">{u.name} {u.isBlocked && <Pill tone="bad">Blocked</Pill>}</div><div className="muted small">{isRider ? 'Rider' : 'Customer'} · joined {date(u.createdAt)}</div></div></div>}>

        {u.isBlocked && (
          <div className="blocked-banner">
            <IconBan />
            <div>
              <div className="strong">Account blocked{u.blockedAt ? ' on ' + dateTime(u.blockedAt) : ''}</div>
              <div className="small">{u.blockReason || 'No reason recorded'}</div>
            </div>
          </div>
        )}

        <div className="ministats">
          {isRider ? <>
            <MiniStat label="Deliveries" value={num(u.totalDeliveries)} />
            <MiniStat label="Earnings" value={money(u.totalEarnings)} />
            <MiniStat label="Rating" value={<span className="rating"><IconStar /> {(u.rating ?? 5).toFixed(1)}</span>} />
          </> : <>
            <MiniStat label="Orders" value={num(mine.length)} />
            <MiniStat label="Delivered value" value={money(value)} />
            <MiniStat label="Completion" value={completion} />
          </>}
        </div>

        <section className="drawer-section">
          <h3>Profile</h3>
          <dl className="fields">
            <Field label="Phone">{u.phone ? <a className="link" href={'tel:' + u.phone}>{u.phone}</a> : ''}</Field>
            <Field label="Email">{u.email}</Field>
            {isRider && <>
              <Field label="Duty">{u.isOnline ? <Pill tone="good">Online</Pill> : <Pill>Offline</Pill>}</Field>
              <Field label="Vehicle">{[u.vehicleType, u.vehicleNumber].filter(Boolean).join(' · ')}</Field>
              <Field label="Ratings received">{num(u.ratingCount)}</Field>
              <Field label="Completion rate">{completion}</Field>
            </>}
            {!isRider && <Field label="Cancelled orders">{num(cancelled)}</Field>}
            {u.deletedAt && <Field label="Account deleted"><Pill tone="bad">{date(u.deletedAt)}</Pill></Field>}
            <Field label="User ID"><span className="mono small">{u._id}</span> <CopyButton text={u._id} /></Field>
          </dl>
        </section>

        <section className="drawer-section">
          <h3>Account control</h3>
          <div className={'control-card' + (u.isBlocked ? ' is-blocked' : '')}>
            <span className="control-icon"><IconShield /></span>
            <div className="person-main">
              <div className="strong">{u.isBlocked ? 'Blocked' : 'Active'}</div>
              <div className="muted small">
                {u.isBlocked
                  ? 'Cannot book, accept or deliver orders, or connect to live tracking.'
                  : 'Block this account if you received a complaint.' + (activeCount ? ' Has ' + activeCount + ' active order(s).' : '')}
              </div>
            </div>
            {u.deletedAt ? null : u.isBlocked
              ? <button className="btn btn-sm" onClick={() => setDialog('unblock')}>Unblock</button>
              : <button className="btn btn-sm btn-danger-outline" onClick={() => setDialog('block')}><IconBan /> Block</button>}
          </div>
          {history.length > 0 && (
            <ol className="audit">
              {history.map((h, i) => (
                <li key={i}>
                  <span className={'audit-dot ' + h.action} />
                  <div>
                    <div><span className="strong">{h.action === 'block' ? 'Blocked' : 'Unblocked'}</span>{h.reason ? <span className="muted"> · {h.reason}</span> : null}</div>
                    <div className="muted small">{dateTime(h.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="drawer-section">
          <h3>Order history <span className="muted">({num(mine.length)})</span></h3>
          {mine.length === 0 ? <div className="muted">No orders yet.</div> : (
            <ul className="mini-orders">
              {mine.slice(0, 20).map(o => (
                <li key={o._id}>
                  <button onClick={() => openOrder(o._id)}>
                    <div className="mini-order-main">
                      <span className="mono small">{o.orderId}</span>
                      <span className="muted small truncate">{o.delivery?.address}</span>
                    </div>
                    <div className="mini-order-side">
                      <StatusBadge status={o.status} />
                      <span className="small">{money(orderFare(o))} · <span className="muted">{dateTime(o.createdAt)}</span></span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mine.length > 20 && <div className="muted small" style={{ marginTop: 8 }}>Showing the latest 20.</div>}
        </section>
      </Drawer>
      {dialog && <BlockDialog user={u} mode={dialog} onClose={() => setDialog(null)} />}
    </>
  )
}
