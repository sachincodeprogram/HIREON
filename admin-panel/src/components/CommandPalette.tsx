import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../data'
import { money, orderFare } from '../format'
import { Avatar, StatusBadge } from './ui'
import { IconActivity, IconBox, IconMap, IconChart, IconDashboard, IconSearch, IconServer, IconUsers, IconBike } from './icons'

interface Item { id: string; group: string; icon: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; run: () => void }

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { orders, riders, customers } = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const items = useMemo<Item[]>(() => {
    const n = q.trim().toLowerCase()
    const pages: Item[] = [
      { id: 'p-dash', group: 'Pages', icon: <IconDashboard />, title: 'Dashboard', run: () => nav('/') },
      { id: 'p-activity', group: 'Pages', icon: <IconActivity />, title: 'Live activity', run: () => nav('/activity') },
      { id: 'p-live', group: 'Pages', icon: <IconMap />, title: 'Live tracking', run: () => nav('/live') },
      { id: 'p-orders', group: 'Pages', icon: <IconBox />, title: 'Orders', run: () => nav('/orders') },
      { id: 'p-riders', group: 'Pages', icon: <IconBike />, title: 'Riders', run: () => nav('/riders') },
      { id: 'p-cust', group: 'Pages', icon: <IconUsers />, title: 'Customers', run: () => nav('/customers') },
      { id: 'p-an', group: 'Pages', icon: <IconChart />, title: 'Analytics', run: () => nav('/analytics') },
      { id: 'p-sys', group: 'Pages', icon: <IconServer />, title: 'System status', run: () => nav('/system') },
    ].filter(p => !n || String(p.title).toLowerCase().includes(n))
    if (!n) return pages

    const has = (...v: (string | undefined)[]) => v.some(x => x?.toLowerCase().includes(n))
    const os: Item[] = orders
      .filter(o => has(o.orderId, o._id, o.customer?.name, o.customer?.phone, o.rider?.name, o.pickup?.address, o.delivery?.address))
      .slice(0, 8)
      .map(o => ({
        id: 'o-' + o._id, group: 'Orders', icon: <IconBox />,
        title: <span className="mono">{o.orderId}</span>,
        sub: (o.customer?.name ?? '—') + ' · ' + (o.delivery?.address ?? ''),
        right: <><span className="muted small">{money(orderFare(o))}</span><StatusBadge status={o.status} /></>,
        run: () => nav('/orders?order=' + o._id),
      }))
    const us: Item[] = [...riders, ...customers]
      .filter(u => has(u.name, u.phone, u.email, u.vehicleNumber))
      .slice(0, 8)
      .map(u => ({
        id: 'u-' + u._id, group: u.role === 'rider' ? 'Riders' : 'Customers', icon: <Avatar name={u.name} src={u.avatar} size={22} />,
        title: u.name, sub: [u.phone, u.email].filter(Boolean).join(' · '),
        run: () => nav((u.role === 'rider' ? '/riders' : '/customers') + '?user=' + u._id),
      }))
    return [...pages, ...os, ...us]
  }, [q, orders, riders, customers, nav])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const run = (it?: Item) => { if (!it) return; onClose(); it.run() }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]) }
    else if (e.key === 'Escape') onClose()
  }

  let lastGroup = ''
  return (
    <div className="cmdk-root" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="cmdk-input">
          <IconSearch />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search orders, riders, customers, pages…" />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {items.length === 0 && <div className="cmdk-empty muted">No results for “{q}”</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null
            return (
              <div key={it.id}>
                {head && <div className="cmdk-group">{head}</div>}
                <button className={'cmdk-item' + (i === sel ? ' sel' : '')} data-sel={i === sel}
                  onMouseMove={() => setSel(i)} onClick={() => run(it)}>
                  <span className="cmdk-icon">{it.icon}</span>
                  <span className="cmdk-text">
                    <span className="cmdk-title">{it.title}</span>
                    {it.sub && <span className="cmdk-sub muted small">{it.sub}</span>}
                  </span>
                  {it.right && <span className="cmdk-right">{it.right}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot muted small"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</div>
      </div>
    </div>
  )
}
