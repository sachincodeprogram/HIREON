// HIREON backend ke admin endpoints (/api/v1/admin/*) — read calls + block/unblock, support ticket ke jawab
// aur rider wallet credit.
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

async function request<T>(method: 'GET' | 'PATCH' | 'POST', path: string, opts: { params?: Params; body?: unknown; key?: string | null } = {}): Promise<T> {
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

export interface ActivityRef { _id: string; name: string; role?: 'customer' | 'rider' }

export interface ActivityEvent {
  id: string
  type: 'order' | 'signup' | 'block' | 'unblock' | 'rider_online' | 'rider_offline' | 'wallet_credit'
  at: string
  status?: string
  note?: string
  reason?: string
  /** wallet_credit: paise */
  amount?: number
  category?: WalletCategory
  user?: ActivityRef
  order?: {
    _id: string
    orderId: string
    status: OrderStatus
    fare: { estimated: number; final: number }
    paymentMethod?: 'COD' | 'ONLINE'
    pickup: string
    delivery: string
    customer: ActivityRef | null
    rider: ActivityRef | null
  }
}

export interface ActivityData { serverTime: string; since: string; events: ActivityEvent[] }

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type SupportCategory = 'order_issue' | 'payment' | 'wallet' | 'behaviour' | 'account' | 'app_bug' | 'other'

export interface SupportMessage { _id: string; sender: 'user' | 'support' | 'system'; text: string; createdAt: string }

export interface SupportUser {
  _id: string
  name: string
  phone?: string
  email?: string
  role: 'customer' | 'rider'
  avatar?: string
  isBlocked?: boolean
  vehicleType?: string
  vehicleNumber?: string
  createdAt?: string
}

export interface SupportTicketRow {
  _id: string
  ticketNo: string
  category: SupportCategory
  status: SupportStatus
  role: 'customer' | 'rider'
  orderCode?: string
  subject: string
  lastMessage: { sender: SupportMessage['sender']; text: string; createdAt: string } | null
  adminUnread: boolean
  messageCount: number
  lastMessageAt: string
  createdAt: string
  user: SupportUser | null
}

export interface SupportTicket {
  _id: string
  ticketNo: string
  category: SupportCategory
  status: SupportStatus
  role: 'customer' | 'rider'
  orderCode?: string
  order: { _id: string; orderId: string; status: OrderStatus; fare?: { estimated: number; final: number }; paymentMethod?: string; createdAt: string; pickup?: { address: string }; delivery?: { address: string } } | null
  user: SupportUser | null
  messages: SupportMessage[]
  platform?: string
  appVersion?: string
  resolvedAt?: string | null
  lastMessageAt: string
  createdAt: string
}

export interface SupportList {
  items: SupportTicketRow[]
  total: number
  page: number
  pages: number
  counts: Partial<Record<SupportStatus, number>>
  unread: number
}

// Wallet amounts hamesha PAISE me (backend jaisa) — ₹100 = 10000
export type WalletCategory = 'incentive' | 'bonus' | 'promo' | 'refund' | 'compensation' | 'adjustment' | 'other'

export interface WalletBalances {
  minBalance: number
  maxCredit: number
  wallets: { rider: string; balance: number; updatedAt: string }[]
}

export interface WalletTxn {
  _id: string
  type: 'EARNING' | 'COMMISSION_DEBIT' | 'RECHARGE' | 'REFUND'
  amount: number
  balanceAfter: number
  order?: { _id: string; orderId: string } | null
  description?: string
  source?: 'system' | 'razorpay' | 'admin'
  adminCategory?: WalletCategory | ''
  createdAt: string
}

export interface RiderWallet { balance: number; minBalance: number; maxCredit: number; transactions: WalletTxn[] }

export interface WalletCreditInput {
  riderIds?: string[]
  all?: boolean
  amountPaise: number
  category: WalletCategory
  note: string
  requestId: string
}

export interface WalletCreditResult {
  requestId: string
  amountPaise: number
  category: WalletCategory
  credited: { _id: string; name: string; balance: number; duplicate: boolean }[]
  skipped: { _id: string; name: string; reason: string }[]
  failed: { _id: string; name: string; error: string }[]
  totalPaise: number
}

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

  activity: (since?: string) => get<ActivityData>('/activity', { since, limit: 200 }),

  blockUser: (id: string, reason: string) =>
    request<{ user: User; activeOrders: number }>('PATCH', '/users/' + encodeURIComponent(id) + '/block', { body: { reason } }),

  supportTickets: async (p: { status?: string; page?: number; limit?: number } = {}): Promise<SupportList> => {
    const d = await get<{ tickets: SupportTicketRow[]; total: number; page: number; pages: number; counts: SupportList['counts']; unread: number }>('/support/tickets', p)
    return { items: d.tickets, total: d.total, page: d.page, pages: d.pages, counts: d.counts, unread: d.unread }
  },

  supportTicket: (id: string) => get<SupportTicket>('/support/tickets/' + encodeURIComponent(id)),

  supportReply: (id: string, message: string) =>
    request<SupportTicket>('POST', '/support/tickets/' + encodeURIComponent(id) + '/reply', { body: { message } }),

  supportStatus: (id: string, status: SupportStatus) =>
    request<SupportTicket>('PATCH', '/support/tickets/' + encodeURIComponent(id) + '/status', { body: { status } }),

  unblockUser: (id: string, reason: string) =>
    request<{ user: User }>('PATCH', '/users/' + encodeURIComponent(id) + '/unblock', { body: { reason } }),

  walletBalances: () => get<WalletBalances>('/wallets'),

  riderWallet: (id: string) => get<RiderWallet>('/riders/' + encodeURIComponent(id) + '/wallet', { limit: 30 }),

  creditWallets: (input: WalletCreditInput) => request<WalletCreditResult>('POST', '/wallets/credit', { body: input }),
}
