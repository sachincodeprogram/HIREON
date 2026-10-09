import { useEffect, useRef, useState } from 'react'
import { api, type User } from '../api'
import { useData } from '../data'
import { useToast } from '../toast'
import { isActive } from '../analytics'
import { Avatar } from './ui'
import { IconShield, IconX } from './icons'

const REASONS = {
  customer: ['Customer complaint', 'Abusive or rude behaviour', 'Fake or fraudulent orders', 'Repeated cancellations', 'Payment issue'],
  rider: ['Customer complaint', 'Misconduct with customer', 'Parcel damaged or missing', 'Repeated cancellations', 'Fraud / fake deliveries', 'Unsafe driving'],
}

export default function BlockDialog({ user, mode, onClose }: { user: User; mode: 'block' | 'unblock'; onClose: () => void }) {
  const { orders, updateUser } = useData()
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

  const isBlock = mode === 'block'
  const active = orders.filter(o => isActive(o) && (o.customer?._id === user._id || o.rider?._id === user._id))
  const reason = [preset, note.trim()].filter(Boolean).join(' — ')
  const canSubmit = isBlock ? reason.length >= 3 : true

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (isBlock) {
        const r = await api.blockUser(user._id, reason)
        updateUser(r.user)
        toast({ tone: 'success', title: user.name + ' has been blocked', body: r.activeOrders ? r.activeOrders + ' active order(s) still open — follow up with the customer.' : 'They can no longer use the app.' })
      } else {
        const r = await api.unblockUser(user._id, reason)
        updateUser(r.user)
        toast({ tone: 'success', title: user.name + ' has been unblocked', body: 'Full access to the app is restored.' })
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-root" onMouseDown={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="block-title" onMouseDown={e => e.stopPropagation()}>
        <header className="modal-head">
          <span className={'modal-icon' + (isBlock ? ' danger' : ' good')}><IconShield /></span>
          <div>
            <h2 id="block-title">{isBlock ? 'Block account' : 'Unblock account'}</h2>
            <p className="muted small">{isBlock ? 'They will be disconnected right away and the app will refuse every action until you unblock them.' : 'The user will regain full access to the app immediately.'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><IconX /></button>
        </header>

        <div className="modal-body">
          <div className="person modal-person">
            <Avatar name={user.name} src={user.avatar} size={36} />
            <div className="person-main">
              <div className="strong">{user.name}</div>
              <div className="muted small">{user.role === 'rider' ? 'Rider' : 'Customer'} · {user.phone || user.email || user._id}</div>
            </div>
          </div>

          {isBlock && active.length > 0 && (
            <div className="callout callout-warn">
              <strong>{active.length} active order{active.length > 1 ? 's' : ''}</strong> — blocking won’t cancel {active.length > 1 ? 'them' : 'it'}.
              {user.role === 'rider' ? ' The rider will not be able to complete the delivery.' : ' The customer will not be able to track or cancel it.'}
            </div>
          )}
          {!isBlock && user.blockReason && (
            <div className="callout">Blocked for: <strong>{user.blockReason}</strong></div>
          )}

          {isBlock && (
            <>
              <div className="label">Reason</div>
              <div className="chips">
                {REASONS[user.role].map(r => (
                  <button key={r} type="button" className={'chip' + (preset === r ? ' on' : '')} onClick={() => { setPreset(p => (p === r ? '' : r)); noteRef.current?.focus() }}>{r}</button>
                ))}
              </div>
            </>
          )}

          <label className="label" htmlFor="block-note">{isBlock ? 'Details (complaint ID, what happened)' : 'Note (optional)'}</label>
          <textarea id="block-note" ref={noteRef} className="input textarea" rows={3} maxLength={400} value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isBlock ? 'e.g. Customer reported rude behaviour on order ORD…' : 'e.g. Issue resolved after call with user'} />

          {err && <div className="form-error" role="alert">{err}</div>}
        </div>

        <footer className="modal-foot">
          <span className="muted small">{isBlock ? 'Recorded in the account’s audit history.' : ''}</span>
          <div className="modal-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className={'btn ' + (isBlock ? 'btn-danger' : 'btn-primary')} onClick={submit} disabled={busy || !canSubmit}>
              {busy ? <><span className="btn-spinner" /> Saving…</> : isBlock ? 'Block account' : 'Unblock account'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
