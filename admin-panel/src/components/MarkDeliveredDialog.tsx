import { useEffect, useRef, useState } from 'react'
import { api, type Order } from '../api'
import { useData } from '../data'
import { useToast } from '../toast'
import { money, orderFare } from '../format'
import { IconCheck, IconX } from './icons'

const REASONS = [
  'Rider delivered, app could not confirm',
  'Cash collected — swipe not working',
  'Customer confirmed delivery on call',
]

// Rider ne parcel de diya par app me order complete nahi ho paya (jaise COD swipe
// bug) — admin yahan se order delivered mark karta hai. Backend wahi settlement
// chalata hai jo rider ke swipe se hota: stats + COD commission / ONLINE earning.
export default function MarkDeliveredDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrder, refresh } = useData()
  const toast = useToast()
  const [preset, setPreset] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Capture phase + stop — warna peeche wala drawer bhi Esc par band ho jaata
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); if (!busy) onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const isCod = (order.paymentMethod ?? 'COD') === 'COD'
  const fare = orderFare(order)
  // Commission = fare − rider earning (backend ke splitFareForCommission jaisa hi, approx)
  const commission = order.riderEarning ? Math.max(0, fare - order.riderEarning) : null
  const reason = [preset, note.trim()].filter(Boolean).join(' — ')
  const canSubmit = reason.length >= 3

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const updated = await api.markDelivered(order._id, reason)
      updateOrder(updated)
      toast({ tone: 'success', title: 'Order ' + (order.orderId || '') + ' marked delivered', body: 'It now shows as Delivered in the rider’s History.' })
      onClose()
      // Rider stats / wallet balance bhi badle hain — background me taaza karo
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-root" onMouseDown={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="deliver-title" onMouseDown={e => e.stopPropagation()}>
        <header className="modal-head">
          <span className="modal-icon good"><IconCheck /></span>
          <div>
            <h2 id="deliver-title">Mark as delivered</h2>
            <p className="muted small">Use this only when the rider has handed over the parcel but could not complete the order in the app.</p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><IconX /></button>
        </header>

        <div className="modal-body">
          <div className="person modal-person">
            <div className="person-main">
              <div className="strong mono">{order.orderId || order._id}</div>
              <div className="muted small">
                Rider: {order.rider?.name ?? '—'}{order.rider?.phone ? ' · ' + order.rider.phone : ''} · {order.paymentMethod ?? 'COD'} · {money(fare)}
              </div>
            </div>
          </div>

          <div className="callout callout-warn">
            {isCod
              ? <>This is a <strong>COD</strong> order. The platform commission{commission !== null ? <> (about <strong>{money(commission)}</strong>)</> : null} will be <strong>deducted from the rider’s wallet</strong>, the same as a normal delivery.</>
              : <>This is an <strong>online-paid</strong> order. The rider’s earning will be <strong>credited to their wallet</strong>, the same as a normal delivery.</>}
            {' '}The rider’s earnings and delivery count also go up. This cannot be undone.
          </div>

          <div className="label">Reason</div>
          <div className="chips">
            {REASONS.map(r => (
              <button key={r} type="button" className={'chip' + (preset === r ? ' on' : '')} onClick={() => { setPreset(p => (p === r ? '' : r)); noteRef.current?.focus() }}>{r}</button>
            ))}
          </div>

          <label className="label" htmlFor="deliver-note">Details (optional if a reason is picked)</label>
          <textarea id="deliver-note" ref={noteRef} className="input textarea" rows={3} maxLength={250} value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Rider called support, cash ₹ collected, customer confirmed" />

          {err && <div className="form-error" role="alert">{err}</div>}
        </div>

        <footer className="modal-foot">
          <span className="muted small">Recorded in the order’s activity log.</span>
          <div className="modal-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>
              {busy ? <><span className="btn-spinner" /> Saving…</> : 'Mark delivered'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
