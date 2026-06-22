# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HIREON is a parcel-delivery app (a Dunzo/Porter-style "book a rider, track them live" product) with two roles — **customer** (books parcels) and **rider** (accepts & delivers). It has two parts in one repo:

- **Root** — a React Native 0.86 mobile app (TypeScript, `src/`).
- **`backend/`** — a separate Node/Express + Socket.IO + MongoDB API server (plain JS, CommonJS). It has its own `package.json` and `node_modules`; install and run it independently.

The two communicate over a REST API (`/api/v1`) and a Socket.IO connection for real-time order dispatch and live location tracking.

## Commands

### Mobile app (root)
```sh
npm start                 # Metro bundler
npm run android           # build + run on Android device/emulator
npm run ios               # build + run on iOS (run `bundle exec pod install` in ios/ first)
npm run lint              # eslint
npm test                  # jest (preset @react-native/jest-preset)
npx jest __tests__/App.test.tsx   # run a single test file
```
On a USB Android device in dev, the app talks to the backend at `localhost:5000` — run `adb reverse tcp:5000 tcp:5000` so the device can reach it.

### Backend (`backend/`)
```sh
cd backend
npm run dev               # nodemon (auto-reload) — the normal dev command
npm start                 # node src/server.js
npm run lint              # eslint src/
```
Requires a `backend/.env` (copy from `backend/.env.example`). Needs a reachable MongoDB. There is no backend test suite.

### Android release build
```sh
cd android && ./gradlew bundleRelease   # AAB for Play Store (or assembleRelease for APK)
```

## Dev vs prod configuration (important)

There is **no `.env` for the mobile app** — RN has no runtime `process.env`. Config is selected by the built-in `__DEV__` flag in **`src/config/env.ts`**: `__DEV__ === true` (Metro/debug) uses the `dev` block, a release build uses the `prod` block. App code never reads `env.ts` directly — it imports from **`src/constants/api.ts`**, which re-exports those values. The `prod` block still has placeholder URLs; `PRODUCTION_CHECKLIST.md` is the authoritative pre-release guide.

### The dev auth bypass — know this before touching auth
To develop without sending real SMS, the app can authenticate with a fake `Bearer dev:<phone>` token instead of a Firebase ID token. This is gated on **both sides**:
- App: `src/services/apiClient.ts` and `src/services/socketService.ts` send `dev:<phone>` only when `__DEV__` and a dev phone has been set (`setDevPhone` / `getDevPhone`).
- Backend: `backend/src/middleware/auth.js` and `backend/src/socket/handlers.js` accept `dev:` tokens only when `NODE_ENV === 'development'`.

**The backend MUST run with `NODE_ENV=production` in prod** — otherwise anyone can impersonate any account with a `dev:` token. Real auth path is Firebase phone OTP → Firebase ID token → backend verifies via Firebase Admin and looks up the `User` by `firebaseUid`.

## Architecture

### Auth & role-based navigation (app)
`App.tsx` wraps everything in Redux `Provider` + `SafeAreaProvider` and renders `RootNavigator`. **`src/navigation/RootNavigator.tsx` is the central gate**: it subscribes to `auth().onAuthStateChanged`, loads the backend profile via `getMyProfile()` into `authSlice`, and then picks the navigator tree by `profile.role`:
- no profile → `AuthNavigator` (login / role-select / signup)
- `customer` → `CustomerNavigator`
- `rider` → `RiderNavigator`

A Firebase user with no backend profile is sent back to Auth to finish signup. Note the bypass quirk: in dev, a `firebaseUser` of `null` does not clear auth if a dev phone is set.

### State (app)
Redux Toolkit store in `src/store/index.ts` with three slices: `auth`, `order`, `rider`. Use the typed hooks `useAppSelector` / `useAppDispatch` (`src/hooks/`), not the bare react-redux ones.

### Services layer (app)
`src/services/` is the only place that talks to the outside world — keep network/socket logic here, not in screens:
- `apiClient.ts` — axios instance; request interceptor injects the auth header (dev token or Firebase ID token); response interceptor unwraps `{ success, message }` errors into plain `Error`s.
- `socketService.ts` — single Socket.IO connection; emits/listens for tracking events.
- `authService`, `orderService`, `riderService`(via slices), `locationService`, `routeService`, `ringtoneService`.
- `routeService.ts` draws the live route line + ETA: tries Google Routes API first, falls back to OSRM (`OSRM_BASE_URL`), and falls back to a straight line if both fail (never crashes).

### Backend request shape
`backend/src/server.js` boots Firebase Admin, connects Mongo, registers socket handlers, then mounts routes under `/api/v1` (`routes/index.js` → `auth`, `orders`, `rider`, `admin`). The pattern is **routes → controllers → Mongoose models**, with `middleware/auth.js` `protect` (auth) and `requireRole('customer'|'rider'|'admin')` guarding endpoints. Controllers return a uniform envelope via `utils/apiResponse.js` (`success()` / `error()`). Admin routes are guarded by `ADMIN_API_KEY`.

### Real-time order lifecycle (the core flow)
`onlineRiders` is an in-memory `Map<firebaseUid → socketId>` built in `socket/handlers.js` and **attached to every request** (`req.io`, `req.onlineRiders`) so controllers can emit. Order status flows `pending → accepted → picked_up → in_transit → delivered` (or `cancelled`), enforced in `controllers/orderController.js`:
1. Customer creates an order → backend emits `new_order_request` to every online rider's socket.
2. A rider accepts (`/orders/:id/accept`) → order assigned, customer in the order room gets `order_update`.
3. Pickup and delivery are each confirmed with a **4-digit OTP** (`pickupOtp` / `deliveryOtp`, generated at order creation) the rider enters — this is the proof-of-handoff mechanism, not a security token.
4. On delivery, the rider's `totalEarnings` / `totalDeliveries` are incremented.

Live tracking uses Socket.IO **rooms keyed by order `_id`**: the customer emits `track_order` and the rider emits `join_order` to join the room; the rider streams `rider_location` events which are broadcast to the customer in that room.

## Conventions

- **Code comments are frequently in Hinglish** (romanized Hindi, e.g. "store karo", "bhejo"). This is the existing house style — match the surrounding file; don't rewrite existing Hinglish comments into English.
- Mobile app is **TypeScript**; backend is **plain CommonJS JavaScript** (`require`/`module.exports`) — don't introduce ESM or TS into `backend/`.
- Theme/colors live in `src/constants/theme.ts` (re-exported via `constants/api.ts` as `COLORS`). Reuse the shared components in `src/components/common/` (Button, Card, Input, etc.) rather than restyling inline.
- The repo root is littered with `.png` screenshots, `ui*.xml` UI dumps, and `_*.log` debug artifacts from manual device testing — these are not source; ignore them.
