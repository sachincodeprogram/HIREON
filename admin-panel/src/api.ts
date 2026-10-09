// HIREON backend ke admin endpoints (/api/v1/admin/*) — sirf READ-ONLY calls.
// Admin key kabhi bundle me nahi jaati: login par user type karta hai, sessionStorage me
// rehti hai (tab band = key gayi).

const KEY_STORAGE = 'hireon_admin_key'

export type OrderStatus = 'pending' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled'

export interface Person {
  _id: string
  name: string
  email?: string
  phone?: string
  vehicleType?: string
  vehicleNumber?: string
}

export interface Location {
  address: string
  coordinates?: { lat: number; lng: number }
  contactName?: string
  contactPhone?: string
}

export interface Order {
  _id: string
  orderId: string
  customer: Person | null
  rider: Person | null
  pickup: Location
  delivery: Location
  parcel?: { description?: string; weight?: number; size?: string; isFragile?: boolean }
  fare: { estimated: number; final: number; distance: number }
  status: OrderStatus
  paymentMethod?: 'COD' | 'ONLINE'
  paymentStatus?: 'pending' | 'paid' | 'failed'
  timeline?: { status: string; note?: string; timestamp: string }[]
  rating?: number
  review?: string
  cancelledBy?: string
  cancellationNote?: string
  riderEarning?: number
  deliveredAt?: string
  createdAt: string
  updatedAt: string
}

export interface User {
  _id: string
  name: string
  email?: string
  phone?: string
  avatar?: string
  role: 'customer' | 'rider'
  vehicleType?: string
  vehicleNumber?: string
  isOnline?: boolean
  totalEarnings?: number
  totalDeliveries?: number
  rating?: number
  ratingCount?: number
  deletedAt?: string | null
  isBlocked?: boolean
  blockedAt?: string | null
  blockReason?: string
  blockHistory?: { action: 'block' | 'unblock'; reason?: string; at: string }[]
  createdAt: string
}

export interface Stats {
  users: { total: number; riders: number; customers: number }
  orders: { total: number; active: number }
  todayRevenue: number
}

export interface Paged<T> {
  total: number
  page: number
  pages: number
  items: T[]
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const getKey = () => {
  try { return sessionStorage.getItem(KEY_STORAGE) } catch { return null }
}
export const setKey = (k: string) => {
  try { sessionStorage.setItem(KEY_STORAGE, k) } catch { /* private mode */ }
}
export const clearKey = () => {
  try { sessionStorage.removeItem(KEY_STORAGE) } catch { /* ignore */ }
}

type Params = Record<string, string | number | undefined>

async function request<T>(method: 'GET' | 'PATCH', path: string, opts: { params?: Params; body?: unknown; key?: string | null } = {}): Promise<T> {
  const qs = new URLSearchParams()
  Object.entries(opts.params ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)) })
  const query = qs.toString()
  const url = '/api/v1/admin' + path + (query ? '?' + query : '')
  const key = opts.key === undefined ? getKey() : opts.key

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { 'x-admin-key': key ?? '', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) {
    let msg = body?.message || 'Request failed (' + res.status + ')'
    if (res.status === 403 && body?.message === 'Admin access required') msg = 'Invalid admin key.'
    // Backend ka purana version (naye admin routes deploy nahi hue)
    else if (res.status === 404 && body?.message === 'Route not found') msg = 'This feature needs the latest backend. Deploy the backend update first.'
    // Write request par Origin header jaata hai — Render ke ALLOWED_ORIGINS me panel ka domain chahiye
    else if (res.status === 500 && /CORS/i.test(body?.message ?? '')) msg = 'Server rejected this site (CORS). Add the admin panel URL to ALLOWED_ORIGINS on the backend.'
    throw new ApiError(msg, res.status)
  }
  return body.data as T
}

const get = <T,>(path: string, params: Params = {}, key?: string | null) => request<T>('GET', path, { params, key })

export interface RiderLocation { lat: number; lng: number; heading?: number; speed?: number; updatedAt: string }

export interface LiveRider {
  _id: string
  name: string
  phone?: string
  avatar?: string
  vehicleType?: string
  vehicleNumber?: string
  isOnline?: boolean
  isBlocked?: boolean
  rating?: number
  connected: boolean
  location: RiderLocation | null
}

export interface LiveData { serverTime: string; orders: Order[]; riders: LiveRider[] }

export const api = {
  stats: (key?: string) => get<Stats>('/stats', {}, key),

  orders: async (p: { status?: string; page?: number; limit?: number }): Promise<Paged<Order>> => {
    const d = await get<{ orders: Order[]; total: number; page: number; pages: number }>('/orders', p)
    return { items: d.orders, total: d.total, page: d.page, pages: d.pages }
  },

  users: async (p: { role?: string; page?: number; limit?: number }): Promise<Paged<User>> => {
    const d = await get<{ users: User[]; total: number; page: number; pages: number }>('/users', p)
    return { items: d.users, total: d.total, page: d.page, pages: d.pages }
  },

  live: () => get<LiveData>('/live'),

  blockUser: (id: string, reason: string) =>
    request<{ user: User; activeOrders: number }>('PATCH', '/users/' + encodeURIComponent(id) + '/block', { body: { reason } }),

  unblockUser: (id: string, reason: string) =>
    request<{ user: User }>('PATCH', '/users/' + encodeURIComponent(id) + '/unblock', { body: { reason } }),
}
