import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type SupportCategory, type SupportStatus, type SupportTicket, type SupportTicketRow } from '../api'
import { useToast } from '../toast'
import { ago, dateTime, money, num } from '../format'
import {
  Avatar, Card, CopyButton, Drawer, Empty, ErrorBox, Field, Kpi, PageHeader, Pagination, Pill, Segmented, SkeletonRows,
  SortTh, StatusBadge, useSortedPaged,
} from '../components/ui'
import { IconHeadset, IconRefresh, IconSearch, IconSend, IconX } from '../components/icons'

const REFRESH_MS = 30_000

export const CATEGORY_LABEL: Record<SupportCategory, string> = {
  order_issue: 'Order / delivery issue',
  payment: 'Payment & payouts',
  wallet: 'Wallet & recharge',
  behaviour: 'Behaviour complaint',
  account: 'Account & profile',
  app_bug: 'App problem',
  other: 'Other',
}

const STATUS_META: Record<SupportStatus, { label: string; tone: 'warn' | 'info' | 'good' | 'neutral' }> = {
  open: { label: 'Open', tone: 'warn' },
  in_progress: { label: 'In progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'good' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const QUICK_REPLIES = [
  'Thanks for reaching out. We are looking into this and will update you shortly.',
  'Could you please share a few more details (order ID, what happened and when)?',
  'Sorry for the trouble. This has been fixed on our side — please check again and let us know.',
]

type Filter = 'all' | 'needs_reply' | SupportStatus
type SortKey = 'ticket' | 'updated' | 'created'

export function TicketStatus({ status }: { status: SupportStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.open
  return <Pill tone={m.tone}>{m.label}</Pill>
}

export default function Support() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<SupportTicketRow[]>([])
  const [counts, setCounts] = useState<Partial<Record<SupportStatus, number>>>({})
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const ticketId = params.get('ticket')

  const load = useCallback(() => {
    api.supportTickets({ limit: 200 })
      .then(d => { setRows(d.items); setCounts(d.counts); setUnread(d.unread); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const openTicket = (id: string | null) => setParams(prev => {
    const p = new URLSearchParams(prev)
    if (id) p.set('ticket', id); else p.delete('ticket')
    return p
  }, { replace: !id })

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === 'needs_reply' && !(r.adminUnread && (r.status === 'open' || r.status === 'in_progress'))) return false
      if (filter !== 'all' && filter !== 'needs_reply' && r.status !== filter) return false
      if (n && ![r.ticketNo, r.user?.name, r.user?.phone, r.orderCode, r.subject].some(v => v?.toLowerCase().includes(n))) return false
      return true
    })
  }, [rows, filter, q])

  const t = useSortedPaged<SupportTicketRow, SortKey>(filtered, {
    ticket: r => r.ticketNo, updated: r => r.lastMessageAt, created: r => r.createdAt,
  }, { key: 'updated', dir: 'desc' })

  const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0)
  const filters: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'needs_reply', label: 'Needs reply', count: unread },
    { value: 'open', label: 'Open', count: counts.open ?? 0 },
    { value: 'in_progress', label: 'In progress', count: counts.in_progress ?? 0 },
    { value: 'resolved', label: 'Resolved', count: counts.resolved ?? 0 },
    { value: 'closed', label: 'Closed', count: counts.closed ?? 0 },
  ]

  // Drawer me status/reply badla — list ki row bhi turant update karo
  const patchRow = (tk: SupportTicket) => {
    setRows(rs => rs.map(r => r._id === tk._id ? {
      ...r, status: tk.status, adminUnread: false, lastMessageAt: tk.lastMessageAt, messageCount: tk.messages.length,
      lastMessage: tk.messages.length ? { ...tk.messages[tk.messages.length - 1] } : r.lastMessage,
    } : r))
    load()
  }

  return (
    <>
      <PageHeader title="Support" subtitle="Questions and complaints from riders and customers">
        <button className="btn" onClick={() => { setLoading(true); load() }}><IconRefresh /> Refresh</button>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={load} />}

      <div className="kpi-grid kpi-grid-4">
        <Kpi loading={loading} label="Needs reply" value={num(unread)} hint="new message from the user" />
        <Kpi loading={loading} label="Open" value={num(counts.open)} hint="not picked up yet" />
        <Kpi loading={loading} label="In progress" value={num(counts.in_progress)} hint="team is working on it" />
        <Kpi loading={loading} label="Resolved" value={num((counts.resolved ?? 0) + (counts.closed ?? 0))} hint={num(total) + ' tickets in total'} />
      </div>

      <Card flush>
        <div className="table-toolbar">
          <Segmented value={filter} onChange={setFilter} options={filters} />
          <div className="toolbar-row">
            <label className="search">
              <IconSearch />
              <input placeholder="Search ticket no, name, phone, order ID…" value={q} onChange={e => setQ(e.target.value)} />
              {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear"><IconX /></button>}
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortTh k="ticket" sort={t.sort} onSort={t.toggle}>Ticket</SortTh>
                <th>From</th>
                <th>Topic</th>
                <th>Message</th>
                <th>Status</th>
                <SortTh k="updated" sort={t.sort} onSort={t.toggle} num>Updated</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? <SkeletonRows cols={6} /> : t.pageRows.map(r => (
                <tr key={r._id} className={'clickable' + (r.adminUnread ? ' row-unread' : '')} onClick={() => openTicket(r._id)}>
                  <td className="nowrap">
                    <span className="ticket-no">{r.adminUnread && <i className="unread-dot" />}<span className="mono">{r.ticketNo}</span></span>
                    {r.orderCode && <div className="muted small mono">#{r.orderCode}</div>}
                  </td>
                  <td>
                    <div className="user-cell">
                      <Avatar name={r.user?.name} src={r.user?.avatar} size={30} />
                      <div>
                        <div className="strong">{r.user?.name ?? 'Deleted user'}</div>
                        <div className="muted small">{r.role === 'rider' ? 'Rider' : 'Customer'}{r.user?.phone ? ' · ' + r.user.phone : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                  <td className="ticket-preview">
                    <div className={r.adminUnread ? 'strong' : ''}>{r.subject}</div>
                    {r.lastMessage && r.lastMessage.sender !== 'user' && r.lastMessage.sender !== 'system' && (
                      <div className="muted small truncate">You: {r.lastMessage.text}</div>
                    )}
                  </td>
                  <td><TicketStatus status={r.status} /></td>
                  <td className="num muted nowrap">{ago(r.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && t.total === 0 && (
            <Empty title={q || filter !== 'all' ? 'No matching tickets' : 'No support tickets yet'}>
              {q || filter !== 'all' ? 'Try a different search or filter.' : 'When a rider or customer contacts support from the app, the ticket shows up here.'}
            </Empty>
          )}
        </div>
        {t.total > 0 && <Pagination page={t.page} pages={t.pages} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />}
      </Card>

      {ticketId && <SupportDrawer id={ticketId} onClose={() => openTicket(null)} onChange={patchRow} />}
    </>
  )
}

function SupportDrawer({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: (t: SupportTicket) => void }) {
  const toast = useToast()
  const [, setParams] = useSearchParams()
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<'reply' | SupportStatus | null>(null)
  const threadEnd = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.supportTicket(id).then(tk => { setTicket(tk); setError(null) }).catch(e => setError(e.message))
  }, [id])

  useEffect(() => {
    setTicket(null)
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }) }, [ticket?.messages.length])

  const send = async () => {
    const msg = reply.trim()
    if (!msg || busy) return
    setBusy('reply')
    try {
      const tk = await api.supportReply(id, msg)
      setTicket(tk); setReply(''); onChange(tk)
      toast({ tone: 'success', title: 'Reply sent', body: (tk.user?.name ?? 'The user') + ' will see it in the app.' })
    } catch (e) {
      toast({ tone: 'error', title: 'Reply not sent', body: (e as Error).message })
    } finally { setBusy(null) }
  }

  const setStatus = async (status: SupportStatus) => {
    setBusy(status)
    try {
      const tk = await api.supportStatus(id, status)
      setTicket(tk); onChange(tk)
      toast({ tone: 'success', title: tk.ticketNo + ' · ' + STATUS_META[status].label })
    } catch (e) {
      toast({ tone: 'error', title: 'Status not updated', body: (e as Error).message })
    } finally { setBusy(null) }
  }

  const openOrder = (orderId: string) => setParams(prev => {
    const p = new URLSearchParams(prev)
    p.delete('ticket'); p.set('order', orderId)
    return p
  })

  const u = ticket?.user
  const closed = ticket?.status === 'closed'

  return (
    <Drawer open onClose={onClose} width={600}
      title={ticket ? <><IconHeadset /> <span className="mono">{ticket.ticketNo}</span> <TicketStatus status={ticket.status} /></> : 'Loading…'}
      subtitle={ticket ? CATEGORY_LABEL[ticket.category] + ' · opened ' + dateTime(ticket.createdAt) : undefined}>

      {error && <div style={{ marginTop: 16 }}><ErrorBox message={error} onRetry={load} /></div>}
      {!ticket && !error && <div className="muted" style={{ padding: '24px 0' }}>Loading conversation…</div>}

      {ticket && <>
        <section className="drawer-section">
          <div className="user-cell">
            <Avatar name={u?.name} src={u?.avatar} size={40} />
            <div className="person-main">
              <div className="strong">{u?.name ?? 'Deleted user'} {u?.isBlocked && <Pill tone="bad">Blocked</Pill>}</div>
              <div className="muted small">{ticket.role === 'rider' ? 'Rider' : 'Customer'}{u?.vehicleNumber ? ' · ' + u.vehicleNumber : ''}</div>
            </div>
          </div>
          <dl className="fields" style={{ marginTop: 14 }}>
            <Field label="Phone">{u?.phone ? <a className="link" href={'tel:' + u.phone}>{u.phone}</a> : ''}</Field>
            <Field label="Email">{u?.email}</Field>
            <Field label="Related order">
              {ticket.order
                ? <><button className="link link-btn" onClick={() => openOrder(ticket.order!._id)}>#{ticket.order.orderId}</button> <StatusBadge status={ticket.order.status} /></>
                : ''}
            </Field>
            <Field label="Order value">{ticket.order?.fare ? money(ticket.order.fare.final || ticket.order.fare.estimated) : ''}</Field>
            <Field label="Device">{ticket.platform}</Field>
            <Field label="Ticket ID"><span className="mono small">{ticket.ticketNo}</span> <CopyButton text={ticket.ticketNo} /></Field>
          </dl>
        </section>

        <section className="drawer-section">
          <h3>Conversation <span className="muted">({num(ticket.messages.filter(m => m.sender !== 'system').length)})</span></h3>
          <div className="chat-thread">
            {ticket.messages.map(m => m.sender === 'system' ? (
              <div key={m._id} className="chat-system">{m.text} · {dateTime(m.createdAt)}</div>
            ) : (
              <div key={m._id} className={'chat-msg ' + (m.sender === 'support' ? 'from-support' : 'from-user')}>
                <div className="chat-meta">{m.sender === 'support' ? 'HIREON Support' : (u?.name ?? 'User')} · {dateTime(m.createdAt)}</div>
                <div className="chat-bubble">{m.text}</div>
              </div>
            ))}
            <div ref={threadEnd} />
          </div>
        </section>

        <section className="drawer-section">
          {closed ? (
            <div className="muted small" style={{ marginBottom: 10 }}>This ticket is closed. Reopen it to reply.</div>
          ) : (
            <>
              <div className="quick-replies">
                {QUICK_REPLIES.map(r => <button key={r} className="chip" onClick={() => setReply(r)} title={r}>{r.length > 44 ? r.slice(0, 42) + '…' : r}</button>)}
              </div>
              <textarea className="input textarea" rows={4} maxLength={2000} placeholder={'Reply to ' + (u?.name ?? 'user') + '… (Ctrl + Enter to send)'}
                value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send() }} />
              <div className="reply-bar">
                <span className="muted small">The user gets a notification and sees this in the app chat.</span>
                <button className="btn btn-primary" onClick={send} disabled={!reply.trim() || !!busy}>
                  {busy === 'reply' ? <span className="btn-spinner" /> : <IconSend />} Send reply
                </button>
              </div>
            </>
          )}
          <div className="status-actions">
            {ticket.status !== 'in_progress' && !closed && <button className="btn btn-sm" disabled={!!busy} onClick={() => setStatus('in_progress')}>Mark in progress</button>}
            {ticket.status !== 'resolved' && !closed && <button className="btn btn-sm" disabled={!!busy} onClick={() => setStatus('resolved')}>Mark resolved</button>}
            {!closed && <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => setStatus('closed')}>Close ticket</button>}
            {(closed || ticket.status === 'resolved') && <button className="btn btn-sm" disabled={!!busy} onClick={() => setStatus('open')}>Reopen</button>}
          </div>
        </section>
      </>}
    </Drawer>
  )
}
