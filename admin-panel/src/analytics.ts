import type { Order, User } from './api'
import { orderFare } from './format'

export const DAY = 86_400_000

export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export const isActive = (o: Order) => ['pending', 'accepted', 'picked_up', 'in_transit'].includes(o.status)

// Delivered order ka revenue kis din count ho — deliveredAt, warna updatedAt
export const deliveredTime = (o: Order) => new Date(o.deliveredAt || o.updatedAt).getTime()

export interface DayPoint { t: number; orders: number; delivered: number; cancelled: number; revenue: number }

export function dailySeries(orders: Order[], days: number): DayPoint[] {
  const today = startOfDay(Date.now())
  const first = today - (days - 1) * DAY
  const pts: DayPoint[] = Array.from({ length: days }, (_, i) => ({ t: first + i * DAY, orders: 0, delivered: 0, cancelled: 0, revenue: 0 }))
  const idx = (t: number) => {
    // DST-safe: din ka start compare karo
    const i = Math.round((startOfDay(t) - first) / DAY)
    return i >= 0 && i < days ? i : -1
  }
  for (const o of orders) {
    const ci = idx(new Date(o.createdAt).getTime())
    if (ci >= 0) {
      pts[ci]!.orders++
      if (o.status === 'cancelled') pts[ci]!.cancelled++
    }
    if (o.status === 'delivered') {
      const di = idx(deliveredTime(o))
      if (di >= 0) { pts[di]!.delivered++; pts[di]!.revenue += orderFare(o) }
    }
  }
  return pts
}

export interface Period { orders: number; delivered: number; cancelled: number; revenue: number }

export function periodTotals(orders: Order[], from: number, to: number): Period {
  const p: Period = { orders: 0, delivered: 0, cancelled: 0, revenue: 0 }
  for (const o of orders) {
    const c = new Date(o.createdAt).getTime()
    if (c >= from && c < to) {
      p.orders++
      if (o.status === 'cancelled') p.cancelled++
    }
    if (o.status === 'delivered') {
      const d = deliveredTime(o)
      if (d >= from && d < to) { p.delivered++; p.revenue += orderFare(o) }
    }
  }
  return p
}

// % change; previous 0 ho to null (infinite growth dikhana misleading hai)
export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100)

export interface PersonStats { orders: number; delivered: number; cancelled: number; spend: number; last?: string }

export function statsBy(orders: Order[], key: 'customer' | 'rider'): Map<string, PersonStats> {
  const m = new Map<string, PersonStats>()
  for (const o of orders) {
    const id = o[key]?._id
    if (!id) continue
    const s = m.get(id) ?? { orders: 0, delivered: 0, cancelled: 0, spend: 0 }
    s.orders++
    if (o.status === 'delivered') { s.delivered++; s.spend += orderFare(o) }
    if (o.status === 'cancelled') s.cancelled++
    if (!s.last || o.createdAt > s.last) s.last = o.createdAt
    m.set(id, s)
  }
  return m
}

export const ordersOf = (orders: Order[], u: User) =>
  orders.filter(o => (u.role === 'rider' ? o.rider?._id : o.customer?._id) === u._id)

export function toCsv(rows: Record<string, string | number | boolean | undefined | null>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0]!)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    // Excel formula injection se bacho
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s
    return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
