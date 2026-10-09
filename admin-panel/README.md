# HIREON Admin Panel

React + Vite web admin console for HIREON. Deployed separately on Vercel.

Reads everything through `/api/v1/admin/*`. The **only** write action is blocking / unblocking an
account (audited). It cannot create, edit, cancel or delete orders.

## Pages
- **Dashboard** — KPIs with trend vs previous period (7/30/90 days), orders/revenue chart,
  order pipeline, payment mix, recent orders, live activity feed, top & newest riders
- **Analytics** — monthly trend, fare distribution, busiest hours/days, cancellation breakdown, top customers
- **Orders** — status tabs with counts, date/payment filters, search, sortable columns, CSV export,
  detail panel (progress stepper, route + Google Maps link, people, activity log)
- **Riders / Customers** — KPIs, filters, sortable tables, CSV export, profile panel with order history
- **System status** — API health checks + latency, connection info, keyboard shortcuts
- `Ctrl K` / `/` global search across orders, riders, customers and pages
- Auto-refresh every 60s (only while the tab is visible), light/dark theme, mobile responsive
- Detail panels are linkable (`/orders?order=<id>`, `/riders?user=<id>`)

All data (up to 1,000 orders and 1,000 users per role) is loaded once and filtered in the browser,
so the backend needed no changes. A notice appears if the data ever exceeds that cap.

## Security
- The admin key is **never** in the code or the build. You type it on the login screen; it's checked
  against the server and kept in `sessionStorage` (cleared when the tab closes).
- `/api/*` is proxied by Vercel to the Render backend (see `vercel.json`), so the browser stays
  same-origin — no backend CORS change needed.
- Security headers (CSP, no framing, `noindex`) are set in `vercel.json`; `robots.txt` blocks crawlers.

## Local dev
```sh
cd admin-panel
npm install
npm run dev                 # http://localhost:5173, proxies /api to the live Render backend
# against a local backend instead:
HIREON_API_ORIGIN=http://localhost:5000 npm run dev
```

## Live tracking & account blocking (needs the backend update)
- **Live tracking** (`/live`): active orders + on-duty riders on a Google Map, distance/ETA to the
  next stop, GPS freshness, call buttons, and a ready-to-send customer update (English / हिंदी,
  copy or WhatsApp). Polls `GET /api/v1/admin/live` every 10s.
- **Block / unblock** (rider or customer profile → Account control): reason is required and every
  action is stored in `blockHistory`. A blocked user can only load their profile (`GET /auth/me`);
  every other API call returns 403 `ACCOUNT_BLOCKED`, sockets are refused, and blocked riders are
  taken off duty and skipped by dispatch.

### One-time setup
1. **Deploy the backend first** (the new routes live in `backend/`). Old backend = these two features
   show "needs the latest backend"; everything else keeps working.
2. On Render, add the panel's Vercel URL to **`ALLOWED_ORIGINS`** (comma-separated), e.g.
   `https://hireon-admin.vercel.app`. Block/unblock are PATCH requests, which carry an `Origin` header.
3. Google Cloud Console (project `hireon-8e1c0`) → APIs & Services → enable **Maps JavaScript API**,
   then Credentials → the app's key → API restrictions → add **Maps JavaScript API**.
   Without this the map shows "Map unavailable" (tracking details still work).
4. Vercel → Settings → Environment Variables: `VITE_GOOGLE_MAPS_API_KEY` = that key, then redeploy.
   Locally, put it in `admin-panel/.env.local` (gitignored).

## Deploy on Vercel
1. Push the repo to GitHub.
2. Vercel → **Add New → Project** → import the repo.
3. **Root Directory: `admin-panel`** (important). Framework preset: Vite (auto-detected).
   Build command `npm run build`, output `dist` — defaults are fine. No env vars needed.
4. Deploy, open the URL, sign in with the `ADMIN_API_KEY` set on Render.

If the backend URL ever changes, update it in `vercel.json` (and the default in `vite.config.ts`).
