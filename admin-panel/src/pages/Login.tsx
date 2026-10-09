import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { IconActivity, IconChart, IconShield } from '../components/icons'

export default function Login() {
  const { login } = useAuth()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const k = key.trim()
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      // Key ko server par verify karo, tabhi andar jaane do
      await api.stats(k)
      login(k)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-hero">
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            <div className="brand-name">HIREON</div>
            <div className="brand-sub">Operations console</div>
          </div>
        </div>
        <div className="login-hero-body">
          <h2>Every parcel, rider and rupee — in one place.</h2>
          <ul>
            <li><IconActivity /> Live order pipeline and rider availability</li>
            <li><IconChart /> Revenue, demand and cancellation analytics</li>
            <li><IconShield /> Live rider tracking and account moderation, with an audit trail</li>
          </ul>
        </div>
        <div className="login-hero-foot">© {new Date().getFullYear()} HIREON</div>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="brand brand-mobile">
            <span className="brand-mark">H</span>
            <div className="brand-name">HIREON</div>
          </div>
          <h1>Sign in to the console</h1>
          <p className="muted">Enter the admin API key configured on the server.</p>

          <label className="label" htmlFor="key">Admin key</label>
          <div className="input-wrap">
            <input id="key" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" autoFocus
              value={key} onChange={e => setKey(e.target.value)} placeholder="Enter admin key" spellCheck={false} />
            <button type="button" className="input-addon" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy || !key.trim()}>
            {busy ? <><span className="btn-spinner" /> Verifying…</> : 'Sign in'}
          </button>

          <p className="login-foot">
            <IconShield /> The key is kept in this browser tab only and is cleared when you close it.
          </p>
        </form>
      </main>
    </div>
  )
}
