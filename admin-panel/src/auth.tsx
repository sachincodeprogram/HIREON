import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { clearKey, getKey, setKey } from './api'

interface AuthCtx {
  authed: boolean
  login: (key: string) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx>({ authed: false, login: () => {}, logout: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getKey())
  const login = useCallback((k: string) => { setKey(k); setAuthed(true) }, [])
  const logout = useCallback(() => { clearKey(); setAuthed(false) }, [])
  return <Ctx.Provider value={{ authed, login, logout }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)
