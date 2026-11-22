import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type Pricing, type PricingAdmin, type PricingChange, type PricingConfig, type PricingPreview, type QuoteInput } from '../api'
import { useToast } from '../toast'
import { money, num } from '../format'
import { Card, Segmented } from './ui'
import { IconPlus, IconRupee, IconX } from './icons'
import { describeChanges, FareLines, hourLabel, pctLabel, SplitLines } from './fare'

// Pricing settings — admin rate card, distance slabs (tiered) aur commission badalta hai.
// Har badlav pehle preview hota hai (aaj vs naya), phir reason ke saath save; save hote hi
// backend naye orders isi rate par banata hai. Pehle se bane orders ka rate lock rehta hai.

interface SlabForm { upToKm: string; perKmRate: string }
interface Form {
  commissionPercent: string; baseFare: string; minDistanceKm: string; slabs: SlabForm[]
  weightLimitKg: string; weightRate: string; fragileCharge: string; stopCharge: string; small: string; medium: string; large: string
  nightEnabled: boolean; nightMultiplier: string; nightStartHour: number; nightEndHour: number
}

const s = (n: number) => String(n)
const n = (v: string) => (v.trim() === '' ? NaN : Number(v))

const toForm = (c: PricingConfig): Form => ({
  commissionPercent: s(c.commissionPercent), baseFare: s(c.baseFare), minDistanceKm: s(c.minDistanceKm),
  slabs: c.slabs.map(x => ({ upToKm: x.upToKm === null ? '' : s(x.upToKm), perKmRate: s(x.perKmRate) })),
  weightLimitKg: s(c.weightLimitKg), weightRate: s(c.weightRate), fragileCharge: s(c.fragileCharge), stopCharge: s(c.stopCharge ?? 0),
  small: s(c.sizeCharges.small), medium: s(c.sizeCharges.medium), large: s(c.sizeCharges.large),
  nightEnabled: c.nightEnabled, nightMultiplier: s(c.nightMultiplier), nightStartHour: c.nightStartHour, nightEndHour: c.nightEndHour,
})

const toConfig = (f: Form): PricingConfig => ({
  commissionPercent: n(f.commissionPercent), baseFare: n(f.baseFare), minDistanceKm: n(f.minDistanceKm),
  slabs: f.slabs.map((x, i) => ({ upToKm: i === f.slabs.length - 1 ? null : n(x.upToKm), perKmRate: n(x.perKmRate) })),
  weightLimitKg: n(f.weightLimitKg), weightRate: n(f.weightRate), fragileCharge: n(f.fragileCharge), stopCharge: n(f.stopCharge),
  sizeCharges: { small: n(f.small), medium: n(f.medium), large: n(f.large) },
  nightEnabled: f.nightEnabled, nightMultiplier: n(f.nightMultiplier), nightStartHour: f.nightStartHour, nightEndHour: f.nightEndHour,
})

export const configOf = (p: Pricing | PricingConfig): PricingConfig => toConfig(toForm(p))

const REASONS = ['Fuel price change', 'Festival / peak demand', 'Competitive pricing', 'Rider incentive', 'Correction']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

function NumField({ label, value, onChange, prefix, suffix, step = '1', hint, min = '0' }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; step?: string; hint?: ReactNode; min?: string
}) {
  return (
    <label className="pf-field">
      <span className="label">{label}</span>
      <span className={'pf-input' + (prefix ? ' has-prefix' : '') + (suffix ? ' has-suffix' : '')}>
        {prefix && <span className="pf-affix pf-prefix">{prefix}</span>}
        <input className="input" type="number" inputMode="decimal" min={min} step={step} value={value} onChange={e => onChange(e.target.value)} />
        {suffix && <span className="pf-affix pf-suffix">{suffix}</span>}
      </span>
      {hint && <span className="pf-hint">{hint}</span>}
    </label>
  )
}

const delta = (a: number, b: number) => {
  const d = b - a
  if (Math.abs(d) < 0.5) return <span className="pf-delta flat">—</span>
  return <span className={'pf-delta ' + (d > 0 ? 'up' : 'down')}>{d > 0 ? '+' : '−'}{money(Math.abs(d))}</span>
}

export default function PricingEditor({ data, seed, onSaved }: {
  data: PricingAdmin
  /** History se "Load into editor" — is config ko draft me bhar do */
  seed: { config: PricingConfig; label: string } | null
  onSaved: (r: { pricing: Pricing; history: PricingChange[] }) => void
}) {
  const toast = useToast()
  const saved = useMemo(() => configOf(data.pricing), [data.pricing])
  // Parent key={version + seed} deta hai — save/load par editor naye sire se banta hai
  const [form, setForm] = useState<Form>(() => toForm(seed?.config ?? data.pricing))

  const config = useMemo(() => toConfig(form), [form])
  const dirty = JSON.stringify(config) !== JSON.stringify(saved)
  const changes = useMemo(() => describeChanges(saved, config), [saved, config])
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  // ── slabs ──
  const setSlab = (i: number, k: keyof SlabForm, v: string) => setForm(f => ({ ...f, slabs: f.slabs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))
  const addSlab = () => setForm(f => {
    const bounds = f.slabs.slice(0, -1).map(x => n(x.upToKm)).filter(Number.isFinite)
    const lastBound = bounds.length ? bounds[bounds.length - 1]! : 0
    const next = lastBound ? lastBound * 2 : 5
    const last = f.slabs[f.slabs.length - 1]!
    return { ...f, slabs: [...f.slabs.slice(0, -1), { upToKm: s(next), perKmRate: last.perKmRate }, last] }
  })
  // Ek click me 0–5 / 5–50 / 50–100 / 100+ km — rate abhi wale pehle slab ka, admin baad me badle
  const applyStandardSlabs = () => setForm(f => {
    const r = f.slabs[0]?.perKmRate ?? '10'
    return { ...f, slabs: [{ upToKm: '5', perKmRate: r }, { upToKm: '50', perKmRate: r }, { upToKm: '100', perKmRate: r }, { upToKm: '', perKmRate: r }] }
  })
  const removeSlab = (i: number) => setForm(f => {
    if (f.slabs.length <= 1) return f
    const slabs = f.slabs.filter((_, j) => j !== i)
    return { ...f, slabs }
  })

  // ── live preview (backend wahi formula chalata hai jo app ke liye) ──
  const [trip, setTrip] = useState<QuoteInput>({ distanceKm: 10, weightKg: 1, size: 'small', fragile: false, night: false })
  const [tripKm, setTripKm] = useState('10')
  const [tripKg, setTripKg] = useState('1')
  const [preview, setPreview] = useState<PricingPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    const id = ++seq.current
    setPreviewing(true)
    const t = setTimeout(() => {
      api.previewPricing(config, trip)
        .then(p => { if (id === seq.current) setPreview(p) })
        .catch(e => { if (id === seq.current) setPreview({ error: e instanceof Error ? e.message : 'Preview failed' }) })
        .finally(() => { if (id === seq.current) setPreviewing(false) })
    }, 350)
    return () => clearTimeout(t)
  }, [config, trip])
  useEffect(() => { setTrip(t => ({ ...t, distanceKm: Number(tripKm) || 0, weightKg: Number(tripKg) || 1 })) }, [tripKm, tripKg])

  const invalid = preview?.error ?? null
  const [confirm, setConfirm] = useState(false)

  // Commission ka chhota example (₹200 order)
  const pctNow = Number.isFinite(config.commissionPercent) ? config.commissionPercent : 0
  const exCommission = Math.round((200 * pctNow) / 100)

  let from = 0
  return (
    <>
      <div className="grid grid-main pricing-grid">
        <div className="stack">
          <Card title="Commission" subtitle="HIREON’s share of every order. The rider earns the rest.">
            <div className="pf-row pf-row-commission">
              <NumField label="Commission rate" value={form.commissionPercent} onChange={set('commissionPercent')} suffix="%" step="0.5" />
              <div className="pf-example">
                <div className="muted small">On a ₹200 order</div>
                <div className="pf-example-split">
                  <span><b>{money(exCommission)}</b> HIREON</span>
                  <span><b>{money(200 - exCommission)}</b> Rider</span>
                </div>
                <div className="pf-bar" aria-hidden="true"><span style={{ width: Math.min(Math.max(pctNow, 0), 100) + '%' }} /></div>
              </div>
            </div>
            <p className="pf-note">Commission is rounded to the nearest rupee. On COD orders it is debited from the rider’s wallet; on online orders the rider’s wallet is credited with the fare minus commission.</p>
          </Card>

          <Card title="Base fare & distance" subtitle="Tiered pricing — the kilometres in each slab are charged at that slab’s rate">
            <div className="pf-row">
              <NumField label="Base fare" value={form.baseFare} onChange={set('baseFare')} prefix="₹" hint="Added to every order" />
              <NumField label="Minimum distance" value={form.minDistanceKm} onChange={set('minDistanceKm')} suffix="km" step="0.1" hint="Shorter trips are charged as this" />
            </div>
            <div className="slab-table" role="table" aria-label="Distance slabs">
              <div className="slab-head" role="row"><span>From</span><span>Up to</span><span>Rate per km</span><span /></div>
              {form.slabs.map((x, i) => {
                const last = i === form.slabs.length - 1
                const start = from
                if (!last) from = n(x.upToKm) || from
                return (
                  <div className="slab-row" role="row" key={i}>
                    <span className="slab-from">{start} km</span>
                    {last
                      ? <span className="slab-open">and above</span>
                      : <span className="pf-input has-suffix"><input className="input" type="number" min="0" step="0.5" value={x.upToKm} onChange={e => setSlab(i, 'upToKm', e.target.value)} aria-label={'Slab ' + (i + 1) + ' up to km'} /><span className="pf-affix pf-suffix">km</span></span>}
                    <span className="pf-input has-prefix has-suffix"><span className="pf-affix pf-prefix">₹</span><input className="input" type="number" min="0" step="0.5" value={x.perKmRate} onChange={e => setSlab(i, 'perKmRate', e.target.value)} aria-label={'Slab ' + (i + 1) + ' rate'} /><span className="pf-affix pf-suffix">/km</span></span>
                    <button className="icon-btn icon-btn-sm" onClick={() => removeSlab(i)} disabled={form.slabs.length <= 1} aria-label={'Remove slab ' + (i + 1)} title="Remove slab"><IconX /></button>
                  </div>
                )
              })}
            </div>
            <div className="slab-actions">
              <button className="btn btn-sm" onClick={addSlab} disabled={form.slabs.length >= 10}><IconPlus /> Add slab</button>
              <button className="btn btn-sm btn-ghost" onClick={applyStandardSlabs}>Use 5 / 50 / 100 km slabs</button>
            </div>
            <p className="pf-note">Example: with 0–5 km at ₹12 and 5–50 km at ₹10, a 20 km trip is charged 5 km × ₹12 + 15 km × ₹10. Distance is measured in a straight line along the route — pickup → each stop → final drop.</p>
          </Card>

          <Card title="Parcel charges" subtitle="Extra charges based on what is being sent">
            <div className="pf-row pf-row-3">
              <NumField label="Free weight" value={form.weightLimitKg} onChange={set('weightLimitKg')} suffix="kg" step="0.5" />
              <NumField label="Each extra kg" value={form.weightRate} onChange={set('weightRate')} prefix="₹" />
              <NumField label="Fragile handling" value={form.fragileCharge} onChange={set('fragileCharge')} prefix="₹" />
            </div>
            <div className="pf-row pf-row-3">
              <NumField label="Small parcel" value={form.small} onChange={set('small')} prefix="₹" />
              <NumField label="Medium parcel" value={form.medium} onChange={set('medium')} prefix="₹" />
              <NumField label="Large parcel" value={form.large} onChange={set('large')} prefix="₹" />
            </div>
            <div className="pf-row pf-row-3">
              <NumField label="Each extra stop" value={form.stopCharge} onChange={set('stopCharge')} prefix="₹"
                hint="Per drop point added between pickup and the final drop (max 3)" />
            </div>
          </Card>

          <Card title="Night surcharge" subtitle="Multiplies the fare for bookings made at night (India time)"
            action={<label className="pf-switch"><input type="checkbox" checked={form.nightEnabled} onChange={e => set('nightEnabled')(e.target.checked)} /><span className="pf-switch-track" /><span>{form.nightEnabled ? 'On' : 'Off'}</span></label>}>
            <div className={'pf-row pf-row-3' + (form.nightEnabled ? '' : ' pf-disabled')}>
              <NumField label="Multiplier" value={form.nightMultiplier} onChange={set('nightMultiplier')} prefix="×" step="0.05" min="1" hint={Number.isFinite(n(form.nightMultiplier)) ? '+' + Math.round((n(form.nightMultiplier) - 1) * 100) + '% on the fare' : undefined} />
              <label className="pf-field"><span className="label">Starts at</span>
                <select className="input" value={form.nightStartHour} onChange={e => set('nightStartHour')(Number(e.target.value))} disabled={!form.nightEnabled}>
                  {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </label>
              <label className="pf-field"><span className="label">Ends at</span>
                <select className="input" value={form.nightEndHour} onChange={e => set('nightEndHour')(Number(e.target.value))} disabled={!form.nightEnabled}>
                  {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </label>
            </div>
          </Card>
        </div>

        <div className="stack pricing-side">
          <Card title="Preview" subtitle={dirty ? 'Current rates vs your changes' : 'Fares at the current rates'} action={previewing ? <span className="btn-spinner pf-spin" aria-label="Updating" /> : undefined}>
            {invalid ? <div className="notice notice-warn pf-invalid">{invalid}</div> : (
              <table className="table pf-samples">
                <thead><tr><th>Trip</th><th className="num">Now</th>{dirty && <th className="num">New</th>}{dirty && <th className="num">Change</th>}<th className="num">Rider</th></tr></thead>
                <tbody>
                  {(preview?.samples ?? []).map(r => (
                    <tr key={r.km}>
                      <td>{r.km} km</td>
                      <td className="num">{money(r.current.fare)}</td>
                      {dirty && <td className="num strong-ish">{money(r.draft.fare)}</td>}
                      {dirty && <td className="num">{delta(r.current.fare, r.draft.fare)}</td>}
                      <td className="num muted">{money(dirty ? r.draft.riderEarning : r.current.riderEarning)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="pf-note">Small parcel, 1 kg, daytime.</p>
            {dirty && !invalid && preview?.impact && preview.impact.orders > 0 && (
              <div className="pf-impact">
                <div className="muted small">If the last 30 days’ {num(preview.impact.orders)} delivered orders were priced with your changes</div>
                <div className="pf-impact-grid">
                  <div><span className="muted small">Customer fares</span><b>{money(preview.impact.currentFare)} → {money(preview.impact.draftFare)}</b>{delta(preview.impact.currentFare, preview.impact.draftFare)}</div>
                  <div><span className="muted small">HIREON commission</span><b>{money(preview.impact.currentCommission)} → {money(preview.impact.draftCommission)}</b>{delta(preview.impact.currentCommission, preview.impact.draftCommission)}</div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Try a trip" subtitle={dirty ? 'Priced with your changes' : 'Priced with the current rates'}>
            <div className="pf-row pf-row-trip">
              <NumField label="Distance" value={tripKm} onChange={setTripKm} suffix="km" step="0.5" />
              <NumField label="Weight" value={tripKg} onChange={setTripKg} suffix="kg" step="0.5" />
            </div>
            <div className="pf-trip-opts">
              <Segmented value={trip.size} onChange={v => setTrip(t => ({ ...t, size: v }))} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
              <label className="check"><input type="checkbox" checked={trip.fragile} onChange={e => setTrip(t => ({ ...t, fragile: e.target.checked }))} /> Fragile</label>
              <label className="check"><input type="checkbox" checked={trip.night} onChange={e => setTrip(t => ({ ...t, night: e.target.checked }))} /> Night</label>
            </div>
            {!invalid && preview?.quote && (
              <div className="pf-trip-out">
                <FareLines b={preview.quote.draft.breakdown} />
                {dirty && preview.quote.current.estimated !== preview.quote.draft.estimated && (
                  <div className="pf-was">Currently {money(preview.quote.current.estimated)} {delta(preview.quote.current.estimated, preview.quote.draft.estimated)}</div>
                )}
                <div className="pf-split"><SplitLines farePaise={preview.quote.draft.estimated * 100} commissionPaise={preview.quote.draft.commission * 100} /></div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {dirty && (
        <div className="savebar" role="region" aria-label="Unsaved pricing changes">
          <div className="savebar-text">
            <b>{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</b>
            <span className="muted small">{seed ? 'Loaded from ' + seed.label + ' · ' : ''}Applies to new orders only</span>
          </div>
          <div className="savebar-actions">
            <button className="btn" onClick={() => setForm(toForm(data.pricing))}>Discard</button>
            <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!!invalid || previewing}>Review & save</button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmSave changes={changes} commissionPercent={config.commissionPercent} onClose={() => setConfirm(false)}
          onSave={async note => {
            const r = await api.savePricing(config, note, data.pricing.version)
            toast({ tone: 'success', title: 'Pricing updated', body: 'New orders will use these rates within a few seconds.' })
            setConfirm(false)
            onSaved(r)
          }} />
      )}
    </>
  )
}

function ConfirmSave({ changes, commissionPercent, onClose, onSave }: {
  changes: { label: string; from: string; to: string }[]; commissionPercent: number; onClose: () => void; onSave: (note: string) => Promise<void>
}) {
  const [preset, setPreset] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const reason = [preset, note.trim()].filter(Boolean).join(' — ')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try { await onSave(reason) } catch (e) {
      setErr(e instanceof ApiError && e.status === 409 ? 'Someone else changed the pricing a moment ago. Reload the page to see the latest rates.' : e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <div className="modal-root" onMouseDown={() => !busy && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="pricing-title" onMouseDown={e => e.stopPropagation()}>
        <header className="modal-head">
          <span className="modal-icon good"><IconRupee /></span>
          <div>
            <h2 id="pricing-title">Save new pricing</h2>
            <p className="muted small">New fare estimates and orders use these rates within a few seconds. Orders that are already placed keep their price, commission and rider earning.</p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><IconX /></button>
        </header>
        <div className="modal-body">
          <table className="table pf-changes">
            <thead><tr><th>Setting</th><th>Current</th><th>New</th></tr></thead>
            <tbody>{changes.map(c => <tr key={c.label}><td className="strong-ish">{c.label}</td><td className="muted">{c.from}</td><td className="strong-ish">{c.to}</td></tr>)}</tbody>
          </table>
          {commissionPercent >= 30 && <div className="callout callout-warn">A {pctLabel(commissionPercent)} commission is high — riders keep only {pctLabel(100 - commissionPercent)} of each fare.</div>}
          <div className="label">Reason</div>
          <div className="chips">
            {REASONS.map(r => <button key={r} type="button" className={'chip' + (preset === r ? ' on' : '')} onClick={() => setPreset(p => (p === r ? '' : r))}>{r}</button>)}
          </div>
          <label className="label" htmlFor="pricing-note">Note</label>
          <textarea id="pricing-note" className="input textarea" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Petrol price up ₹5/litre — raising per-km rate" />
          {err && <div className="form-error" role="alert">{err}</div>}
        </div>
        <footer className="modal-foot">
          <span className="muted small">Saved to the pricing change history.</span>
          <div className="modal-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy || reason.length < 3}>
              {busy ? <><span className="btn-spinner" /> Saving…</> : 'Save pricing'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

