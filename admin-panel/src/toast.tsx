import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { IconCheck, IconX } from './components/icons'

type Tone = 'success' | 'error' | 'info'
interface Toast { id: number; tone: Tone; title: string; body?: string }

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), [])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++
    setToasts(ts => [...ts.slice(-3), { ...t, id }])
    setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4000)
  }, [dismiss])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={'toast toast-' + t.tone}>
            <span className="toast-icon">{t.tone === 'error' ? <IconX /> : <IconCheck />}</span>
            <div className="toast-text">
              <div className="strong">{t.title}</div>
              {t.body && <div className="muted small">{t.body}</div>}
            </div>
            <button className="icon-btn icon-btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss"><IconX /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(Ctx)
