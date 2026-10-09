import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../data'
import { dateTime, num } from '../format'
import { Card, PageHeader, Pill } from '../components/ui'
import { IconRefresh } from '../components/icons'

interface Check { ok: boolean; ms: number; at: number; error?: string }

export default function System() {
  const d = useData()
  const [checks, setChecks] = useState<Check[]>([])
  const [busy, setBusy] = useState(false)

  const ping = useCallback(async () => {
    setBusy(true)
    const t0 = performance.now()
    try {
      await api.stats()
      setChecks(c => [{ ok: true, ms: Math.round(performance.now() - t0), at: Date.now() }, ...c].slice(0, 10))
    } catch (e) {
      setChecks(c => [{ ok: false, ms: Math.round(performance.now() - t0), at: Date.now(), error: e instanceof Error ? e.message : 'Failed' }, ...c].slice(0, 10))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { ping() }, [ping])

  const last = checks[0]
  const okCount = checks.filter(c => c.ok).length

  return (
    <>
      <PageHeader title="System status" subtitle="Backend health and how this console connects">
        <button className="btn" onClick={ping} disabled={busy}><IconRefresh className={busy ? 'spin' : ''} /> Run check</button>
      </PageHeader>

      <div className={'status-hero' + (last && !last.ok ? ' down' : '')}>
        <span className={'status-orb' + (busy ? ' pulse' : '')} />
        <div>
          <div className="status-title">{!last ? 'Checking…' : last.ok ? 'All systems operational' : 'API not reachable'}</div>
          <div className="muted small">
            {last ? (last.ok ? 'API responded in ' + last.ms + ' ms' : last.error) + ' · ' + dateTime(new Date(last.at).toISOString()) : ''}
            {last && last.ms > 3000 && last.ok ? ' · slow response (Render free tier may be waking up)' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <Card title="Health checks" subtitle={checks.length ? okCount + ' of ' + checks.length + ' successful this session' : ''}>
          <ul className="checks">
            {checks.map((c, i) => (
              <li key={i}>
                <span className={'check-dot' + (c.ok ? ' ok' : '')} />
                <span>{c.ok ? 'OK' : 'Failed'}</span>
                <span className="muted">{c.ms} ms</span>
                <span className="muted small check-time">{new Date(c.at).toLocaleTimeString('en-IN')}</span>
              </li>
            ))}
          </ul>
          <div className="latency-bars" aria-hidden="true">
            {[...checks].reverse().map((c, i) => (
              <span key={i} className={c.ok ? '' : 'bad'} style={{ height: Math.min(100, 8 + (c.ms / Math.max(...checks.map(x => x.ms), 1)) * 92) + '%' }} />
            ))}
          </div>
        </Card>

        <Card title="Connection">
          <dl className="fields fields-1">
            <div className="field"><dt>API route</dt><dd className="mono small">/api/v1/admin/* → Render backend</dd></div>
            <div className="field"><dt>Access level</dt><dd><Pill tone="info">Admin</Pill> <span className="muted small">Reads all data; the only write is block / unblock, which is logged</span></dd></div>
            <div className="field"><dt>Authentication</dt><dd>Admin key, stored in this tab only (sessionStorage)</dd></div>
            <div className="field"><dt>Data loaded</dt><dd>{num(d.orders.length)} orders · {num(d.riders.length)} riders · {num(d.customers.length)} customers</dd></div>
            <div className="field"><dt>Last sync</dt><dd>{d.lastUpdated ? dateTime(new Date(d.lastUpdated).toISOString()) + (d.latency ? ' · ' + num(d.latency) + ' ms' : '') : '—'}</dd></div>
            <div className="field"><dt>Auto-refresh</dt><dd>{d.autoRefresh ? 'Every 60 seconds while this tab is visible' : 'Off'}</dd></div>
          </dl>
        </Card>
      </div>

      <Card title="Keyboard shortcuts">
        <div className="shortcuts">
          <div><kbd>Ctrl</kbd> <kbd>K</kbd> <span className="muted">Search anything</span></div>
          <div><kbd>/</kbd> <span className="muted">Open search</span></div>
          <div><kbd>Esc</kbd> <span className="muted">Close panel or search</span></div>
          <div><kbd>↑</kbd> <kbd>↓</kbd> <kbd>↵</kbd> <span className="muted">Move and open in search</span></div>
        </div>
      </Card>
    </>
  )
}
