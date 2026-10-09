import type { OrderStatus } from './api'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const money = (n: number | undefined) => inr.format(n || 0)
export const num = (n: number | undefined) => (n || 0).toLocaleString('en-IN')

export const dateTime = (s?: string) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const date = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const ago = (s?: string) => {
  if (!s) return '—'
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  return Math.round(h / 24) + 'd ago'
}

export const STATUSES: OrderStatus[] = ['pending', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled']

export const statusLabel: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const orderFare = (o: { fare: { final: number; estimated: number } }) => o.fare.final || o.fare.estimated

export const initials = (name?: string) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
