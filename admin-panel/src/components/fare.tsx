import type { ReactNode } from 'react'
import type { FareBreakdown, PricingConfig, Slab } from '../api'
import { paise } from '../format'

// Commission page + pricing editor dono me fare/commission ka hisaab ek jaisa dikhe.

export const rs = (n: number) => paise(Math.round(n * 100))
export const pctLabel = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)) + '%'
export const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM')
const km = (n: number) => String(Math.round(n * 100) / 100)

/** "0–5 km ₹12 · 5–50 km ₹10 · 50+ km ₹8" */
export function slabsText(slabs: Slab[]) {
  let from = 0
  return slabs.map(s => {
    const t = s.upToKm === null ? `${km(from)}+ km` : `${km(from)}–${km(s.upToKm)} km`
    if (s.upToKm !== null) from = s.upToKm
    return `${t} ₹${s.perKmRate}/km`
  }).join(' · ')
}

/** Do config ke beech kya badla — save confirm aur history dono me */
export function describeChanges(a: PricingConfig | null, b: PricingConfig): { label: string; from: string; to: string }[] {
  if (!a) return [{ label: 'Pricing', from: 'Default rates', to: 'Custom rates saved' }]
  const out: { label: string; from: string; to: string }[] = []
  const add = (label: string, x: string, y: string) => { if (x !== y) out.push({ label, from: x, to: y }) }
  add('Commission', a.commissionPercent + '%', b.commissionPercent + '%')
  add('Base fare', '₹' + a.baseFare, '₹' + b.baseFare)
  add('Distance slabs', slabsText(a.slabs), slabsText(b.slabs))
  add('Minimum distance', a.minDistanceKm + ' km', b.minDistanceKm + ' km')
  add('Free weight', a.weightLimitKg + ' kg', b.weightLimitKg + ' kg')
  add('Extra weight', '₹' + a.weightRate + '/kg', '₹' + b.weightRate + '/kg')
  add('Fragile', '₹' + a.fragileCharge, '₹' + b.fragileCharge)
  for (const s of ['small', 'medium', 'large'] as const) add(s[0]!.toUpperCase() + s.slice(1) + ' parcel', '₹' + a.sizeCharges[s], '₹' + b.sizeCharges[s])
  const night = (c: PricingConfig) => (c.nightEnabled ? `×${c.nightMultiplier}, ${hourLabel(c.nightStartHour)}–${hourLabel(c.nightEndHour)}` : 'Off')
  add('Night surcharge', night(a), night(b))
  return out
}

function Line({ label, sub, value, tone }: { label: ReactNode; sub?: ReactNode; value: ReactNode; tone?: 'total' | 'grand' | 'minus' }) {
  return (
    <li className={tone ? 'calc-' + tone : undefined}>
      <span>{label}{sub && <span className="calc-sub">{sub}</span>}</span>
      <span className="calc-val">{value}</span>
    </li>
  )
}

export function FareLines({ b }: { b: FareBreakdown }) {
  return (
    <ul className="calc">
      {b.lines.map((l, i) => <Line key={i} label={l.label} sub={l.detail} value={rs(l.amount)} />)}
      {(b.night || Math.abs(b.rounding) >= 0.01) && <Line tone="total" label="Subtotal" value={rs(b.subtotal)} />}
      {b.night && <Line label="Night surcharge" sub={`×${b.nightMultiplier}`} value={'+' + rs(b.nightCharge)} />}
      {Math.abs(b.rounding) >= 0.01 && <Line label="Rounding" sub={Math.abs(b.rounding) > 1 ? 'differs from the rate card' : 'to nearest rupee'} value={(b.rounding > 0 ? '+' : '−') + rs(Math.abs(b.rounding))} />}
      <Line tone="grand" label="Customer pays" value={rs(b.total)} />
    </ul>
  )
}

export function SplitLines({ farePaise, commissionPaise, payment }: { farePaise: number; commissionPaise: number; payment?: 'COD' | 'ONLINE' }) {
  return (
    <ul className="calc">
      <Line label="Customer fare" value={paise(farePaise)} />
      <Line tone="minus" label="HIREON commission" sub={pctLabel(farePaise ? (commissionPaise / farePaise) * 100 : 0)} value={'−' + paise(commissionPaise)} />
      <Line tone="grand" label="Rider earns" value={paise(farePaise - commissionPaise)} />
      {payment && (
        <li className="calc-note">
          {payment === 'COD'
            ? <>Customer pays <b>{paise(farePaise)}</b> in cash to the rider → <b>{paise(commissionPaise)}</b> is debited from the rider’s wallet.</>
            : <>Customer pays <b>{paise(farePaise)}</b> online to HIREON → <b>{paise(farePaise - commissionPaise)}</b> is credited to the rider’s wallet.</>}
        </li>
      )}
    </ul>
  )
}
