import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { initials, statusLabel } from '../format'
import { IconArrowDown, IconArrowUp, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconCopy, IconX } from './icons'

export function StatusBadge({ status }: { status: string }) {
  return <span className={'badge badge-' + status}><i />{statusLabel[status] ?? status}</span>
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={'pill pill-' + tone}>{children}</span>
}

export function Avatar({ name, src, size = 32 }: { name?: string; src?: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (src && !broken) return <img className="avatar" src={src} alt="" style={style} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  // Naam se stable hue — har user ka avatar alag rang
  const hue = [...(name || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return <span className="avatar" style={{ ...style, ['--av-h' as string]: hue }}>{initials(name)}</span>
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, flush, className = '' }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string
}) {
  return (
    <section className={'card' + (flush ? ' card-flush' : '') + (className ? ' ' + className : '')}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || !isFinite(value)) return <span className="delta delta-flat">—</span>
  const up = value >= 0
  const good = invert ? !up : up
  if (Math.abs(value) < 0.5) return <span className="delta delta-flat">No change</span>
  return (
    <span className={'delta ' + (good ? 'delta-good' : 'delta-bad')}>
      {up ? <IconArrowUp /> : <IconArrowDown />}{Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%
    </span>
  )
}

export function Kpi({ label, value, delta, deltaInvert, hint, chart, loading }: {
  label: string; value: ReactNode; delta?: number | null; deltaInvert?: boolean; hint?: ReactNode; chart?: ReactNode; loading?: boolean
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{loading ? <span className="skeleton skeleton-lg" /> : value}</div>
        {!loading && chart}
      </div>
      <div className="kpi-foot">
        {delta !== undefined && !loading && <Delta value={delta} invert={deltaInvert} />}
        {hint && !loading && <span className="muted small">{hint}</span>}
      </div>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" />
      </svg>
      {title && <div className="empty-title">{title}</div>}
      {children && <div className="muted">{children}</div>}
    </div>
  )
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skeleton-row">
          {Array.from({ length: cols }, (_, c) => <td key={c}><span className="skeleton" /></td>)}
        </tr>
      ))}
    </>
  )
}

/* ---------- sorting + paging (client-side) ---------- */

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> { key: K; dir: SortDir }

export function useSortedPaged<T, K extends string>(rows: T[], getters: Record<K, (r: T) => string | number>, initial: SortState<K>, pageSize = 25) {
  const [sort, setSort] = useState(initial)
  const [page, setPage] = useState(1)
  const sorted = useMemo(() => {
    const g = getters[sort.key]
    const m = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b)
      return (x < y ? -1 : x > y ? 1 : 0) * m
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const cur = Math.min(page, pages)
  useEffect(() => { setPage(1) }, [rows.length, sort])
  const toggle = (key: K) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  return {
    sort, toggle, sorted,
    pageRows: sorted.slice((cur - 1) * pageSize, cur * pageSize),
    page: cur, pages, setPage, total: sorted.length, pageSize,
  }
}

export function SortTh<K extends string>({ k, sort, onSort, children, num }: {
  k: K; sort: SortState<K>; onSort: (k: K) => void; children: ReactNode; num?: boolean
}) {
  const active = sort.key === k
  return (
    <th className={(num ? 'num ' : '') + 'sortable' + (active ? ' sorted' : '')} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(k)}>
        {children}
        <span className="sort-ind">{active ? (sort.dir === 'asc' ? <IconArrowUp /> : <IconArrowDown />) : <IconChevronDown />}</span>
      </button>
    </th>
  )
}

export function Pagination({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)
  // Chhota page window: 1 … 4 5 6 … 20
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <div className="pagination">
      <span className="muted">Showing <b>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</b> of <b>{total.toLocaleString('en-IN')}</b></span>
      <div className="pagination-btns">
        <button className="pg-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><IconChevronLeft /></button>
        {nums.map((n, i) => n === '…'
          ? <span key={'e' + i} className="pg-ellipsis">…</span>
          : <button key={n} className={'pg-btn' + (n === page ? ' active' : '')} onClick={() => onPage(n)}>{n}</button>)}
        <button className="pg-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><IconChevronRight /></button>
      </div>
    </div>
  )
}

/* ---------- inputs ---------- */

export function Segmented<V extends string>({ value, options, onChange }: {
  value: V; options: { value: V; label: ReactNode; count?: number }[]; onChange: (v: V) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Select<V extends string>({ value, options, onChange, label }: {
  value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string
}) {
  return (
    <label className="select">
      <span className="select-label">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as V)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown />
    </label>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const t = useRef<number>(0)
  return (
    <button className="icon-btn icon-btn-sm" title="Copy" aria-label="Copy"
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          clearTimeout(t.current)
          t.current = window.setTimeout(() => setDone(false), 1200)
        }).catch(() => {})
      }}>
      {done ? <IconCheck /> : <IconCopy />}
    </button>
  )
}

/* ---------- drawer ---------- */

export function Drawer({ open, title, subtitle, onClose, children, width = 520 }: {
  open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" style={{ width: 'min(' + width + 'px, 100%)' }}>
        <header className="drawer-head">
          <div className="drawer-heading">
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children === '' || children == null ? <span className="muted">—</span> : children}</dd>
    </div>
  )
}

export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ministat">
      <div className="muted small">{label}</div>
      <div className="ministat-value">{value}</div>
    </div>
  )
}
