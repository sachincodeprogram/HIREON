import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './live.css'
import App from './App'

// Theme pehle hi set karo taaki login page bhi sahi theme me dikhe
let saved: string | null = null
try { saved = localStorage.getItem('hireon_admin_theme') } catch { /* ignore */ }
document.documentElement.dataset.theme =
  saved === 'light' || saved === 'dark' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
