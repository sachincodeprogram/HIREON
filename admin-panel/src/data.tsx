import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type Order, type Stats, type User, type WalletBalances } from './api'
import { useAuth } from './auth'

// Poora dataset ek baar load karke cache karo — data chhota hai (sau-hazaar rows), to
// search/sort/filter/analytics sab client-side ho jaate hain bina backend badle.
const MAX_ROWS = 1000
const AUTO_REFRESH_MS = 60_000

export interface Wallets {
  /** riderId → balance (paise). Jiska wallet abhi bana nahi, uska 0 maano. */
  balances: Map<string, number>
  minBalance: number
  maxCredit: number
}

interface DataState {
  stats: Stats | null
  orders: Order[]
  riders: User[]
  customers: User[]
  ordersTotal: number
  usersCapped: boolean
  /** null = backend ka purana version (wallet routes deploy nahi hue) */
  wallets: Wallets | null
  loading: boolean
  error: string | null
  lastUpdated: number | null
  autoRefresh: boolean
  setAutoRefresh: (v: boolean) => void
  refresh: () => void
  latency: number | null
  /** Block/unblock ke baad local cache patch karo — poora reload nahi */
  updateUser: (u: User) => void
  /** Wallet credit ke baad naye balance cache me daalo */
  updateBalances: (rows: { _id: string; balance: number }[]) => void
}

const Ctx = createContext<DataState | null>(null)

const toWallets = (w: WalletBalances | null): Wallets | null =>
  w && { balances: new Map(w.wallets.map(x => [x.rider, x.balance])), minBalance: w.minBalance, maxCredit: w.maxCredit }

export function DataProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const [state, setState] = useState<Omit<DataState, 'refresh' | 'setAutoRefresh' | 'autoRefresh' | 'updateUser' | 'updateBalances'>>({
    stats: null, orders: [], riders: [], customers: [], ordersTotal: 0, usersCapped: false, wallets: null,
    loading: true, error: null, lastUpdated: null, latency: null,
  })
  const [autoRefresh, setAutoRefreshState] = useState(() => {
    try { return localStorage.getItem('hireon_admin_auto') !== '0' } catch { return true }
  })
  const seq = useRef(0)

  const refresh = useCallback(() => {
    const id = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    const t0 = performance.now()
    Promise.all([
      api.stats(),
      api.orders({ page: 1, limit: MAX_ROWS }),
      api.users({ role: 'rider', page: 1, limit: MAX_ROWS }),
      api.users({ role: 'customer', page: 1, limit: MAX_ROWS }),
      // Wallet na mile to baaki panel chalta rahe — sirf wallet column/feature chhup jaata hai
      api.walletBalances().catch((e: unknown) => { if (e instanceof ApiError && e.status === 403) throw e; return null }),
    ])
      .then(([stats, orders, riders, customers, wallets]) => {
        if (id !== seq.current) return
        setState({
          stats,
          orders: orders.items,
          ordersTotal: orders.total,
          riders: riders.items,
          customers: customers.items,
          usersCapped: riders.total > riders.items.length || customers.total > customers.items.length,
          wallets: toWallets(wallets),
          loading: false,
          error: null,
          lastUpdated: Date.now(),
          latency: Math.round(performance.now() - t0),
        })
      })
      .catch((e: unknown) => {
        if (id !== seq.current) return
        if (e instanceof ApiError && e.status === 403) { logout(); return }
        setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Something went wrong' }))
      })
  }, [logout])

  useEffect(() => { refresh() }, [refresh])

  // Auto-refresh sirf jab tab visible ho, taaki background me server par load na pade
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, AUTO_REFRESH_MS)
    return () => clearInterval(t)
  }, [autoRefresh, refresh])

  const setAutoRefresh = useCallback((v: boolean) => {
    setAutoRefreshState(v)
    try { localStorage.setItem('hireon_admin_auto', v ? '1' : '0') } catch { /* ignore */ }
  }, [])

  const updateUser = useCallback((u: User) => {
    setState(s => ({
      ...s,
      riders: s.riders.map(r => (r._id === u._id ? { ...r, ...u } : r)),
      customers: s.customers.map(c => (c._id === u._id ? { ...c, ...u } : c)),
    }))
  }, [])

  const updateBalances = useCallback((rows: { _id: string; balance: number }[]) => {
    setState(s => {
      if (!s.wallets) return s
      const balances = new Map(s.wallets.balances)
      rows.forEach(r => balances.set(r._id, r.balance))
      return { ...s, wallets: { ...s.wallets, balances } }
    })
  }, [])

  return <Ctx.Provider value={{ ...state, refresh, autoRefresh, setAutoRefresh, updateUser, updateBalances }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}

export const ordersCapped = (d: DataState) => d.orders.length < d.ordersTotal
