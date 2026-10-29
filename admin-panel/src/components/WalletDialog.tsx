import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type User, type WalletCategory, type WalletCreditResult } from '../api'
import { useData } from '../data'
import { useToast } from '../toast'
import { num, paise } from '../format'
import { Avatar, Pill } from './ui'
import { IconCheck, IconWallet, IconX } from './icons'

// Admin → rider wallet credit. Ek rider, chune hue riders ya sab active riders.
// Ek dialog = ek requestId — retry / double-click par backend dobara credit nahi karta.

export const WALLET_CATEGORIES: { value: WalletCategory; label: string; hint: string }[] = [
  { value: 'incentive', label: 'Incentive', hint: 'Target / peak-hour incentive' },
  { value: 'bonus', label: 'Bonus', hint: 'Festival or performance bonus' },
  { value: 'promo', label: 'Promotional credit', hint: 'Joining or referral credit' },
  { value: 'refund', label: 'Refund', hint: 'Money returned to the rider' },
  { value: 'compensation', label: 'Compensation', hint: 'For a cancelled trip or issue' },
  { value: 'adjustment', label: 'Balance adjustment', hint: 'Correct a wrong deduction' },
  { value: 'other', label: 'Other', hint: 'Anything else — explain in the note' },
]

const QUICK = [50, 100, 200, 500, 1000]
const BULK_CONFIRM_RIDERS = 2

const newRequestId = () => {
  try { return crypto.randomUUID() } catch { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) }
}

export type WalletTarget = { kind: 'riders'; riders: User[] } | { kind: 'all'; riders: User[] }

export default function WalletDialog({ target, onClose, onDone }: { target: WalletTarget; onClose: () => void; onDone?: (r: WalletCreditResult) => void }) {
  const { wallets, updateBalances } = useData()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<WalletCategory | ''>('')
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'form' | 'review' | 'result'>('form')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<WalletCreditResult | null>(null)
  const requestId = useRef(newRequestId())
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => { amountRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); if (!busy) onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const riders = target.riders
  const count = riders.length
  const single = target.kind === 'riders' && count === 1 ? riders[0] : null
  const maxRupees = (wallets?.maxCredit ?? 1_000_000) / 100

  const rupees = Number(amount)
  const amountPaise = Math.round(rupees * 100)
  const amountErr = amount === '' ? null
    : !isFinite(rupees) || rupees < 1 ? 'Minimum ₹1'
    : rupees > maxRupees ? 'Maximum ' + paise(maxRupees * 100) + ' per rider'
    : !/^\d+(\.\d{1,2})?$/.test(amount) ? 'Up to 2 decimal places'
    : null
  const valid = amount !== '' && !amountErr && !!category && note.trim().length >= 3
  const total = amountPaise * count
  const needsReview = count >= BULK_CONFIRM_RIDERS
  const catLabel = WALLET_CATEGORIES.find(c => c.value === category)?.label ?? ''

  const names = useMemo(() => {
    const n = riders.slice(0, 3).map(r => r.name.split(' ')[0])
    return count <= 3 ? n.join(', ') : n.join(', ') + ' and ' + num(count - 3) + ' others'
  }, [riders, count])

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await api.creditWallets({
        ...(target.kind === 'all' ? { all: true } : { riderIds: riders.map(x => x._id) }),
        amountPaise, category: category as WalletCategory, note: note.trim(), requestId: requestId.current,
      })
      updateBalances(r.credited)
      onDone?.(r)
      if (single && r.credited.length === 1 && !r.failed.length) {
        toast({ tone: 'success', title: paise(amountPaise) + ' added to ' + single.name + '’s wallet', body: 'New balance ' + paise(r.credited[0]!.balance) + '. A notification has been sent to the rider’s phone.' })
        onClose()
        return
      }
      setResult(r)
      setStep('result')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const primary = () => {
    if (step === 'form') { if (needsReview) { setStep('review'); setErr(null) } else submit() }
    else if (step === 'review') submit()
  }

  const credited = result?.credited.length ?? 0
  const title = step === 'result' ? 'Credit complete' : step === 'review' ? 'Review and confirm' : 'Add money to wallet'

  return (
    <div className="modal-root" onMouseDown={() => !busy && onClose()}>
      <div className="modal wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onMouseDown={e => e.stopPropagation()}>
        <header className="modal-head">
          <span className="modal-icon good"><IconWallet /></span>
          <div>
            <h2 id="wallet-title">{title}</h2>
            <p className="muted small">
              {step === 'result' ? 'Balances are updated. Riders with the app installed get a notification.'
                : 'Credits the rider wallet instantly and is recorded in their transaction history.'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><IconX /></button>
        </header>

        <div className="modal-body">
          {step !== 'result' && (
            single ? (
              <div className="person modal-person">
                <Avatar name={single.name} src={single.avatar} size={36} />
                <div className="person-main">
                  <div className="strong">{single.name} {single.isBlocked && <Pill tone="bad">Blocked</Pill>}</div>
                  <div className="muted small">{single.phone || single.vehicleNumber || single._id}</div>
                </div>
                {wallets && <div className="wallet-current"><div className="muted small">Current balance</div><div className={'strong' + ((wallets.balances.get(single._id) ?? 0) < 0 ? ' neg' : '')}>{paise(wallets.balances.get(single._id) ?? 0)}</div></div>}
              </div>
            ) : (
              <div className="recipients">
                <div className="avatar-stack">
                  {riders.slice(0, 4).map(r => <Avatar key={r._id} name={r.name} src={r.avatar} size={30} />)}
                </div>
                <div className="person-main">
                  <div className="strong">{target.kind === 'all' ? <>All active riders <span className="muted">({num(count)})</span></> : num(count) + ' selected riders'}</div>
                  <div className="muted small truncate">{names}</div>
                </div>
              </div>
            )
          )}

          {step === 'form' && <>
            {target.kind === 'all' && <div className="callout">Blocked and deleted riders are excluded automatically.</div>}

            <label className="label" htmlFor="wallet-amount">Amount {count > 1 ? 'per rider' : ''}</label>
            <div className={'money-input' + (amountErr ? ' invalid' : '')}>
              <span>₹</span>
              <input id="wallet-amount" ref={amountRef} className="input" inputMode="decimal" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1'))}
                onKeyDown={e => { if (e.key === 'Enter' && valid) primary() }} />
            </div>
            <div className="chips quick-amounts">
              {QUICK.filter(q => q <= maxRupees).map(q => (
                <button key={q} type="button" className={'chip' + (rupees === q ? ' on' : '')} onClick={() => setAmount(String(q))}>{paise(q * 100)}</button>
              ))}
            </div>
            {amountErr && <div className="field-error">{amountErr}</div>}

            <div className="label">Reason</div>
            <div className="category-grid">
              {WALLET_CATEGORIES.map(c => (
                <button key={c.value} type="button" className={'category' + (category === c.value ? ' on' : '')} onClick={() => setCategory(c.value)} aria-pressed={category === c.value}>
                  <span className="strong">{c.label}</span>
                  <span className="muted small">{c.hint}</span>
                </button>
              ))}
            </div>

            <label className="label" htmlFor="wallet-note">Note for the rider</label>
            <textarea id="wallet-note" className="input textarea" rows={2} maxLength={200} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Diwali bonus — thank you for your deliveries!" />
            <div className="muted small input-hint"><span>Shown in the rider’s wallet history and notification.</span><span>{note.length}/200</span></div>
          </>}

          {step === 'review' && <>
            <dl className="review-list">
              <div><dt>Recipients</dt><dd>{num(count)} riders</dd></div>
              <div><dt>Amount per rider</dt><dd>{paise(amountPaise)}</dd></div>
              <div><dt>Reason</dt><dd>{catLabel}</dd></div>
              <div><dt>Note</dt><dd>{note.trim()}</dd></div>
              <div className="review-total"><dt>Total payout</dt><dd>{paise(total)}</dd></div>
            </dl>
            <label className="confirm-check">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              <span>I confirm <b>{paise(total)}</b> will be credited across <b>{num(count)}</b> rider wallets. This cannot be undone from the panel.</span>
            </label>
          </>}

          {step === 'result' && result && <>
            <div className="result-stats">
              <div className="result-stat good"><div className="result-num">{num(credited)}</div><div className="muted small">Credited</div></div>
              <div className="result-stat"><div className="result-num">{num(result.skipped.length)}</div><div className="muted small">Skipped</div></div>
              <div className={'result-stat' + (result.failed.length ? ' bad' : '')}><div className="result-num">{num(result.failed.length)}</div><div className="muted small">Failed</div></div>
            </div>
            <div className="callout"><IconCheck /> <b>{paise(result.totalPaise)}</b> paid out · {paise(result.amountPaise)} per rider</div>
            {result.failed.length > 0 && (
              <div className="callout callout-bad">
                <b>{result.failed.length} failed:</b> {result.failed.slice(0, 5).map(f => f.name || f._id).join(', ')}{result.failed.length > 5 ? '…' : ''}. Try again — riders already credited won’t be paid twice.
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="callout">Skipped: {result.skipped.slice(0, 5).map(s => (s.name || s._id) + ' (' + s.reason.toLowerCase() + ')').join(', ')}{result.skipped.length > 5 ? '…' : ''}</div>
            )}
          </>}

          {err && <div className="form-error" role="alert">{err}</div>}
        </div>

        <footer className="modal-foot">
          {step === 'form' && <span className="muted small">{valid && count > 1 ? <>Total <b className="strong">{paise(total)}</b> for {num(count)} riders</> : ' '}</span>}
          {step === 'review' && <button className="btn btn-ghost" onClick={() => setStep('form')} disabled={busy}>Back</button>}
          <div className="modal-actions">
            {step === 'result' ? (
              result?.failed.length
                ? <><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? <><span className="btn-spinner" /> Retrying…</> : 'Retry failed'}</button></>
                : <button className="btn btn-primary" onClick={onClose}>Done</button>
            ) : <>
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={primary} disabled={busy || !valid || (step === 'review' && !confirmed)}>
                {busy ? <><span className="btn-spinner" /> Crediting…</>
                  : step === 'form' && needsReview ? 'Review'
                  : 'Add ' + (valid ? paise(step === 'review' ? total : amountPaise) : 'money')}
              </button>
            </>}
          </div>
        </footer>
      </div>
    </div>
  )
}
