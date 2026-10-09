import { useEffect, useState, type ReactElement, type SVGProps } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { useData } from '../data'
import { useDetail } from '../nav'
import { ago } from '../format'
import CommandPalette from './CommandPalette'
import OrderDrawer from '../pages/OrderDrawer'
import UserDrawer from '../pages/UserDrawer'
import {
  IconBike, IconBox, IconChart, IconMap, IconDashboard, IconLogout, IconMenu, IconMoon, IconRefresh,
  IconSearch, IconServer, IconSun, IconUsers,
} from './icons'

interface NavItem { to: string; label: string; icon: (p: SVGProps<SVGSVGElement>) => ReactElement; end?: boolean; badge?: 'active' | 'online' }

const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
    { to: '/analytics', label: 'Analytics', icon: IconChart },
  ] },
  { title: 'Operations', items: [
    { to: '/live', label: 'Live tracking', icon: IconMap, badge: 'active' },
    { to: '/orders', label: 'Orders', icon: IconBox },
  ] },
  { title: 'People', items: [
    { to: '/riders', label: 'Riders', icon: IconBike, badge: 'online' },
    { to: '/customers', label: 'Customers', icon: IconUsers },
  ] },
  { title: 'System', items: [
    { to: '/system', label: 'System status', icon: IconServer },
  ] },
]
const ALL = SECTIONS.flatMap(s => s.items)

type Theme = 'light' | 'dark'
const THEME_KEY = 'hireon_admin_theme'

export default function Layout() {
  const { logout } = useAuth()
  const data = useData()
  const detail = useDetail()
  const [navOpen, setNavOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  const [, tick] = useState(0)
  const loc = useLocation()

  useEffect(() => { setNavOpen(false); setMenuOpen(false) }, [loc.pathname])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // "Updated 20s ago" label ko taaza rakho
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15_000); return () => clearInterval(t) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(o => !o) }
      else if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault(); setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const current = ALL.find(n => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
  const section = SECTIONS.find(s => current && s.items.includes(current))
  const badges = {
    active: data.stats?.orders.active,
    online: data.riders.filter(r => r.isOnline).length || undefined,
  }
  const order = detail.orderId ? data.orders.find(o => o._id === detail.orderId) ?? null : null
  const user = detail.userId ? [...data.riders, ...data.customers].find(u => u._id === detail.userId) ?? null : null

  return (
    <div className={'shell' + (navOpen ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            <div className="brand-name">HIREON</div>
            <div className="brand-sub">Operations console</div>
          </div>
        </div>

        <button className="side-search" onClick={() => setCmdOpen(true)}>
          <IconSearch /> <span>Search…</span> <kbd>Ctrl K</kbd>
        </button>

        <nav className="nav">
          {SECTIONS.map(s => (
            <div key={s.title} className="nav-section">
              <div className="nav-section-title">{s.title}</div>
              {s.items.map(({ to, label, icon: Icon, end, badge }) => {
                const b = badge ? badges[badge] : undefined
                return (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                    <Icon /> <span>{label}</span>
                    {b ? <span className={'nav-badge' + (badge === 'online' ? ' nav-badge-good' : '')}>{b}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="readonly-note">
            <span className="dot-live" /> Admin access
            <p>Only account blocking can change data. Every block and unblock is recorded.</p>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu"><IconMenu /></button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="muted">{section?.title ?? 'HIREON'}</span>
            <span className="crumb-sep">/</span>
            <span className="strong">{current?.label ?? 'Page'}</span>
          </nav>

          <div className="topbar-right">
            <div className={'sync' + (data.error ? ' sync-err' : '')} title={data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('en-IN') : ''}>
              <span className={'sync-dot' + (data.loading ? ' pulse' : '')} />
              <span className="sync-text">
                {data.error ? 'Sync failed' : data.loading && !data.lastUpdated ? 'Loading…' : 'Updated ' + ago(data.lastUpdated ? new Date(data.lastUpdated).toISOString() : undefined)}
              </span>
              <label className="switch" title="Auto-refresh every 60s">
                <input type="checkbox" checked={data.autoRefresh} onChange={e => data.setAutoRefresh(e.target.checked)} />
                <span className="switch-track" /><span className="switch-label">Auto</span>
              </label>
            </div>
            <button className="icon-btn" onClick={data.refresh} disabled={data.loading} aria-label="Refresh data" title="Refresh">
              <IconRefresh className={data.loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} aria-label="Toggle theme" title="Toggle theme">
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            <div className="menu-wrap">
              <button className="admin-chip" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
                <span className="admin-avatar">A</span>
                <span className="admin-name">Admin</span>
              </button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="menu" role="menu">
                    <div className="menu-head">
                      <div className="strong">Administrator</div>
                      <div className="muted small">Signed in with admin key</div>
                    </div>
                    <button className="menu-item" role="menuitem" onClick={logout}><IconLogout /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <OrderDrawer order={order} onClose={detail.close} />
      <UserDrawer user={user} onClose={detail.close} />
    </div>
  )
}
