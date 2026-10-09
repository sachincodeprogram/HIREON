import type { Order } from '../api'
import { dateTime, money, statusLabel } from '../format'
import { useNavigate } from 'react-router-dom'
import { useDetail } from '../nav'
import { isActive } from '../analytics'
import { Avatar, CopyButton, Drawer, Field, MiniStat, Pill, StatusBadge } from '../components/ui'
import { IconExternal, IconPin } from '../components/icons'

const STEPS = ['pending', 'accepted', 'picked_up', 'in_transit', 'delivered'] as const

function mapsLink(o: Order) {
  const p = o.pickup?.coordinates, d = o.delivery?.coordinates
  if (p && d) return 'https://www.google.com/maps/dir/?api=1&origin=' + p.lat + ',' + p.lng + '&destination=' + d.lat + ',' + d.lng
  return null
}

export default function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { openUser } = useDetail()
  const nav = useNavigate()
  if (!order) return null
  const o = order
  const cancelled = o.status === 'cancelled'
  const reached = cancelled
    ? Math.max(0, ...((o.timeline ?? []).map(t => STEPS.indexOf(t.status as typeof STEPS[number]))))
    : STEPS.indexOf(o.status as typeof STEPS[number])
  const payTone = o.paymentStatus === 'paid' ? 'good' : o.paymentStatus === 'failed' ? 'bad' : 'warn'
  const map = mapsLink(o)
  const stepTime = (s: string) => s === 'pending' ? o.createdAt : o.timeline?.find(t => t.status === s)?.timestamp

  return (
    <Drawer open onClose={onClose}
      title={<><span className="mono">{o.orderId || o._id}</span><CopyButton text={o.orderId || o._id} /><StatusBadge status={o.status} /></>}
      subtitle={'Created ' + dateTime(o.createdAt)}>

      {isActive(o) && (
        <button className="track-cta" onClick={() => nav('/live?track=' + o._id)}>
          <span className="live-pulse" />
          <span><span className="strong">Track live</span><span className="muted small"> · see the rider on the map and send the customer an update</span></span>
          <IconExternal />
        </button>
      )}

      <div className="ministats">
        <MiniStat label="Fare" value={money(o.fare?.final || o.fare?.estimated)} />
        <MiniStat label="Distance" value={o.fare?.distance ? o.fare.distance.toFixed(1) + ' km' : '—'} />
        <MiniStat label="Payment" value={<>{o.paymentMethod ?? 'COD'} <Pill tone={payTone}>{o.paymentStatus ?? 'pending'}</Pill></>} />
      </div>

      <section className="drawer-section">
        <h3>Progress</h3>
        <ol className={'stepper' + (cancelled ? ' stepper-cancelled' : '')}>
          {STEPS.map((s, i) => {
            const done = i <= reached
            const t = stepTime(s)
            return (
              <li key={s} className={done ? 'done' : ''}>
                <span className="step-dot" />
                <span className="step-label">{s === 'pending' ? 'Booked' : statusLabel[s]}</span>
                <span className="step-time muted">{done && t ? dateTime(t) : ''}</span>
              </li>
            )
          })}
        </ol>
        {cancelled && (
          <div className="cancel-note">
            Cancelled{o.cancelledBy ? ' by ' + o.cancelledBy : ''}
            {o.cancellationNote && !/^cancelled by/i.test(o.cancellationNote) ? ': ' + o.cancellationNote : ''}
          </div>
        )}
      </section>

      <section className="drawer-section">
        <div className="section-head">
          <h3>Route</h3>
          {map && <a className="link small" href={map} target="_blank" rel="noopener noreferrer">Open in Maps <IconExternal /></a>}
        </div>
        <div className="route">
          <div className="route-stop">
            <span className="route-dot pickup"><IconPin /></span>
            <div>
              <div className="muted small">Pickup</div>
              <div>{o.pickup?.address}</div>
              {(o.pickup?.contactName || o.pickup?.contactPhone) && <div className="muted small">{o.pickup.contactName} · {o.pickup.contactPhone}</div>}
            </div>
          </div>
          <div className="route-stop">
            <span className="route-dot drop"><IconPin /></span>
            <div>
              <div className="muted small">Drop</div>
              <div>{o.delivery?.address}</div>
              {(o.delivery?.contactName || o.delivery?.contactPhone) && <div className="muted small">{o.delivery.contactName} · {o.delivery.contactPhone}</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="drawer-section">
        <h3>People</h3>
        <div className="people">
          <PersonRow role="Customer" p={o.customer} onOpen={openUser} />
          <PersonRow role="Rider" p={o.rider} onOpen={openUser}
            extra={o.rider ? [o.rider.vehicleType, o.rider.vehicleNumber].filter(Boolean).join(' · ') : undefined} />
        </div>
      </section>

      <section className="drawer-section">
        <h3>Details</h3>
        <dl className="fields">
          <Field label="Estimated fare">{money(o.fare?.estimated)}</Field>
          <Field label="Final fare">{o.fare?.final ? money(o.fare.final) : ''}</Field>
          <Field label="Rider earning">{o.riderEarning ? money(o.riderEarning) : ''}</Field>
          <Field label="Parcel">{o.parcel?.description}</Field>
          <Field label="Weight / size">{[o.parcel?.weight ? o.parcel.weight + ' kg' : '', o.parcel?.size].filter(Boolean).join(' · ')}</Field>
          <Field label="Fragile">{o.parcel?.isFragile ? 'Yes' : 'No'}</Field>
          {o.rating ? <Field label="Rating">{'★'.repeat(o.rating)} <span className="muted">{o.rating}/5</span></Field> : null}
          {o.review ? <Field label="Review">{o.review}</Field> : null}
        </dl>
      </section>

      {!!o.timeline?.length && (
        <section className="drawer-section">
          <h3>Activity log</h3>
          <ol className="timeline">
            <li><span className="tl-dot" /><div><div>Order created</div><div className="muted small">{dateTime(o.createdAt)}</div></div></li>
            {o.timeline.map((t, i) => (
              <li key={i}>
                <span className="tl-dot" />
                <div>
                  <div>{statusLabel[t.status] ?? t.status}{t.note ? <span className="muted"> · {t.note}</span> : null}</div>
                  <div className="muted small">{dateTime(t.timestamp)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Drawer>
  )
}

function PersonRow({ role, p, onOpen, extra }: {
  role: string; p: Order['customer']; onOpen: (id: string) => void; extra?: string
}) {
  if (!p) return (
    <div className="person"><span className="avatar avatar-empty">?</span><div><div className="muted small">{role}</div><div className="muted">Not assigned</div></div></div>
  )
  return (
    <button className="person person-btn" onClick={() => onOpen(p._id)}>
      <Avatar name={p.name} size={36} />
      <div className="person-main">
        <div className="muted small">{role}</div>
        <div className="strong">{p.name}</div>
        <div className="muted small">{[p.phone, extra].filter(Boolean).join(' · ')}</div>
      </div>
      <span className="link small">View</span>
    </button>
  )
}
