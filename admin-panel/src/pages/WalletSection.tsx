import { useCallback, useEffect, useState } from 'react'
import { api, type RiderWallet, type User, type WalletTxn } from '../api'
import { useData } from '../data'
import { useDetail } from '../nav'
import { dateTime, paise } from '../format'
import WalletDialog, { WALLET_CATEGORIES } from '../components/WalletDialog'
import { Pill } from '../components/ui'
import { IconPlus, IconWallet } from '../components/icons'

// Rider drawer ka Wallet hissa — balance, COD status, admin credit aur recent ledger.

const TXN_LABEL: Record<WalletTxn['type'], string> = {
  EARNING: 'Order earning', RECHARGE: 'Recharge', REFUND: 'Refund', COMMISSION_DEBIT: 'Commission',
}

const txnLabel = (t: WalletTxn) => t.source === 'admin'
  ? 'Admin · ' + (WALLET_CATEGORIES.find(c => c.value === t.adminCategory)?.label ?? 'Credit')
  : TXN_LABEL[t.type] ?? t.type

export default function WalletSection({ user }: { user: User }) {
  const { wallets } = useData()
  const { openOrder } = useDetail()
  const [data, setData] = useState<RiderWallet | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    api.riderWallet(user._id).then(setData).catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not load wallet'))
  }, [user._id])

  useEffect(() => { setData(null); load() }, [load])

  // Backend purana ho to section hi mat dikhao
  if (!wallets) return null
  const balance = data?.balance ?? wallets.balances.get(user._id) ?? 0
  const floor = data?.minBalance ?? wallets.minBalance
  const codOk = balance >= floor

  return (
    <section className="drawer-section">
      <h3>Wallet</h3>
      <div className="control-card wallet-card">
        <span className="control-icon wallet-icon"><IconWallet /></span>
        <div className="person-main">
          <div className="wallet-balance">
            <span className={balance < 0 ? 'neg' : ''}>{paise(balance)}</span>
            {codOk ? <Pill tone="good">COD allowed</Pill> : <Pill tone="bad">Below COD limit</Pill>}
          </div>
          <div className="muted small">{codOk ? 'Can accept cash orders.' : 'Needs ' + paise(floor - balance) + ' more to accept cash orders (limit ' + paise(floor) + ').'}</div>
        </div>
        {!user.deletedAt && <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}><IconPlus /> Add money</button>}
      </div>

      {err ? <div className="form-error">{err} <button className="link-btn link" onClick={load}>Retry</button></div>
        : !data ? <div className="muted small wallet-loading">Loading transactions…</div>
        : data.transactions.length === 0 ? <div className="muted small wallet-loading">No wallet transactions yet.</div>
        : (
          <ul className="ledger">
            {data.transactions.map(t => {
              const credit = t.type !== 'COMMISSION_DEBIT'
              return (
                <li key={t._id}>
                  <div className="ledger-main">
                    <div className="strong-ish">{txnLabel(t)} {t.order?.orderId && <button className="link-btn link mono small" onClick={() => openOrder(t.order!._id)}>{t.order.orderId}</button>}</div>
                    <div className="muted small truncate">{t.description || '—'}</div>
                  </div>
                  <div className="ledger-side">
                    <div className={'strong ' + (credit ? 'pos' : 'neg')}>{credit ? '+' : '−'}{paise(t.amount)}</div>
                    <div className="muted small">{dateTime(t.createdAt)} · bal {paise(t.balanceAfter)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

      {open && <WalletDialog target={{ kind: 'riders', riders: [user] }} onClose={() => setOpen(false)} onDone={load} />}
    </section>
  )
}
