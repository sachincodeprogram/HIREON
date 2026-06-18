# HIREON — Production / Public Release Checklist

Everything below is what must be set up before the app works for **real users**
(not just on a USB device in dev mode). Items are ordered by importance.
🔴 = app won't work without it · 🟡 = reliability/security · 🟢 = nice-to-have.

The app picks dev vs prod config automatically from React Native's `__DEV__`
flag (`true` in Metro/debug, `false` in a release build). All environment
values live in **`src/config/env.ts`** — edit the `prod` block, nothing else.

---

## 1. 🔴 Deploy the backend + set the real URL

The `prod` block in `src/config/env.ts` still points at the placeholder
`https://your-production-api.com`. Steps:

1. Deploy `backend/` to a host (Render / Railway / Fly.io / a VPS). It must be
   reachable over **HTTPS** (Socket.IO then uses `wss://` automatically).
2. Set these in `src/config/env.ts` → `prod`:
   ```ts
   API_BASE_URL: 'https://<your-domain>/api/v1',
   SOCKET_URL:   'https://<your-domain>',
   ```
3. `localhost` + `adb reverse` are **dev-only** — not used in release builds.

## 2. 🔴 Backend production env vars

Set these on the deployed server (see `backend/.env.example` for the full list):

| Var | Value |
|-----|-------|
| `NODE_ENV` | **`production`** ← see §3, critical |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON as a single-line string |
| `FIREBASE_PROJECT_ID` | Firebase project id |
| `ALLOWED_ORIGINS` | Comma-separated web origins (mobile app sends no Origin, so it's allowed regardless) |
| `ADMIN_API_KEY` | Strong random key for the admin panel |
| `PORT` | Provided by host, or 5000 |

`FIREBASE_SERVICE_ACCOUNT` is **mandatory** in production — it's how the backend
verifies real Firebase ID tokens (Console → Project Settings → Service Accounts →
Generate new private key).

## 3. 🔴 Set `NODE_ENV=production` (SECURITY — do not skip)

In dev, the backend accepts a `dev:<phone>` token to log in **without any OTP**
(see `middleware/auth.js` and `socket/handlers.js`). If the production server
runs with `NODE_ENV=development`, **anyone can send `Bearer dev:+91xxxxxxxxxx`
and take over any account.** Setting `NODE_ENV=production` disables this bypass
and forces real Firebase OTP verification. Verify after deploy: a `dev:` token
must return 401/404, not log you in.

## 4. 🔴 Real phone OTP (Firebase Console)

The dev test-login (phones `7017696580`/`9458228157`, OTP `123456`) auto-disables
in release builds (`__DEV__` is false). For real SMS OTP:

1. Firebase Console → Authentication → enable **Phone** provider.
2. Upgrade the project to the **Blaze (pay-as-you-go)** plan (phone auth needs it).
3. Add the **release keystore's SHA-1 and SHA-256** fingerprints to the Android
   app in Firebase, and download the updated `google-services.json`.
4. Keep at least one Firebase **test phone number** for store review / QA.

## 5. 🟡 Routing provider for the live route line + ETA

Live tracking's blue route + ETA come from OSRM. `src/config/env.ts` →
`OSRM_BASE_URL` currently uses **`router.project-osrm.org`, a free public DEMO
server with no uptime/rate guarantees** — fine for dev, risky for production.
If it's down/rate-limited the app falls back to a straight line (no crash). For
release pick one:

- **Self-host OSRM** (free, best for volume) → set `OSRM_BASE_URL` to your host.
- **Google Routes API** → enable it + billing on the Maps key. `routeService`
  already tries Google first and only falls back to OSRM, so no code change.
- **Mapbox / OpenRouteService** (would need a small `routeService` adapter).

## 6. 🟡 Google Maps key (map tiles)

The map itself renders via the native Maps SDK using the key in
`android/app/src/main/AndroidManifest.xml` (and iOS `AppDelegate`). For release:

1. Enable **billing** on the Google Cloud project (map tiles are billed by usage).
2. **Restrict** the key: Android apps → package `com.hireon` + release SHA-1; and
   restrict to only the APIs you use (Maps SDK for Android, + Routes API if §5).
3. Update `GOOGLE_MAPS_API_KEY` in `src/config/env.ts` → `prod` to a key that's
   restricted to the release build.
4. Geocoding & Directions (legacy) are currently disabled — that's OK, the app
   uses OSRM/Routes. Enable them only if you add address-search/geocode features.

## 7. 🟡 Android release build signing

1. Generate a release keystore; configure `android/app/build.gradle`
   `signingConfigs.release` (use `gradle.properties` / env, never commit secrets).
2. Use those SHA-1/SHA-256 fingerprints in §4 (Firebase) and §6 (Maps).
3. Build: `cd android && ./gradlew bundleRelease` (AAB for Play Store) or
   `assembleRelease` (APK). This is a release build → `__DEV__` is false → the
   `prod` config block is used.

## 8. 🟢 Pre-launch verification

- [ ] Real phone → real SMS OTP → login works (dev token rejected by prod server).
- [ ] Customer books a parcel → rider (real 2nd device) accepts.
- [ ] Customer LiveTracking shows the rider's marker **moving**, blue route, and
      a live ETA that updates as the rider moves.
- [ ] Pickup/Delivery OTP flow completes end-to-end → order marked delivered.
- [ ] App backgrounded/reconnected → socket reconnects, tracking resumes.
- [ ] Maps render with no "for development only" watermark (= billing OK).

---

### Quick file map
- App env config: `src/config/env.ts` (edit `prod` block)
- Re-exported for app code: `src/constants/api.ts`
- Routing host used by: `src/services/routeService.ts`
- Backend env template: `backend/.env.example`
- Auth bypass (dev-only, gated by `NODE_ENV`): `backend/src/middleware/auth.js`,
  `backend/src/socket/handlers.js`
