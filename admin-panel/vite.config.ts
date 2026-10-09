import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev me /api ko live backend par proxy karo — Vercel par vercel.json yahi karta hai.
// Same-origin rehne se backend ke CORS (ALLOWED_ORIGINS) me kuch badalna nahi padta.
const BACKEND = process.env.HIREON_API_ORIGIN || 'https://hireon-2b4t.onrender.com'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: BACKEND, changeOrigin: true } },
  },
})
