# HIREON backend — live deploy (Render + MongoDB Atlas)

Goal: backend ko ek permanent HTTPS URL pe live karna taaki alag-alag phones (mobile data pe bhi) connect kar sakein.

## 1. MongoDB Atlas (database)
1. https://www.mongodb.com/atlas pe free **M0** cluster banao.
2. **Database Access** → ek user banao (username + password yaad rakho).
3. **Network Access** → `0.0.0.0/0` allow karo (Render ka IP fixed nahi hota).
4. **Connect → Drivers** → connection string copy karo. `<password>` replace karo aur DB name `hireon` daalo:
   ```
   mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/hireon?retryWrites=true&w=majority
   ```
   Ye `MONGODB_URI` hai.

## 2. Firebase service account (OTP auth verify karne ke liye)
1. Firebase Console → Project Settings → **Service accounts** → **Generate new private key** → JSON download hoga.
2. Us JSON ko **single line** me convert karo (Render env var single-line leta hai):
   ```sh
   node -e "console.log(JSON.stringify(require('./serviceAccount.json')))"
   ```
   Output `FIREBASE_SERVICE_ACCOUNT` ki value hai.
3. `FIREBASE_PROJECT_ID` = `hireon-8e1c0` (ya tumhare project ka id).

## 3. Render pe deploy
1. https://render.com pe GitHub se login karo, repo connect karo.
2. **New → Blueprint** → repo choose karo. `backend/render.yaml` automatically detect hoga.
3. Jo `sync: false` waale env vars hain unki values dashboard me bharo:
   - `MONGODB_URI` (step 1)
   - `FIREBASE_SERVICE_ACCOUNT` (step 2)
   - `FIREBASE_PROJECT_ID`
   - `ADMIN_API_KEY` (koi bhi strong random string)
   - `ALLOWED_ORIGINS` (abhi khaali chhod sakte ho — RN app ko CORS ki zaroorat nahi)
   - `NODE_ENV=production` already render.yaml me set hai — **isse mat hatana**.
4. Deploy. Render ek URL dega, jaise `https://hireon-backend.onrender.com`.
5. Test: browser me `https://hireon-backend.onrender.com/api/v1/health` → `{"success":true,...}` aana chahiye.

> Free tier 15 min idle ke baad so jaata hai; pehli request ~50s leti hai (cold start). Live tracking demo ke liye theek hai; serious use ke liye paid plan ya Railway lo.

## 4. App ko live URL pe point karo
`src/config/env.ts` ke **prod block** me apna Render URL daalo:
```ts
const prod: AppEnv = {
  name: 'production',
  API_BASE_URL: 'https://hireon-backend.onrender.com/api/v1',
  SOCKET_URL:   'https://hireon-backend.onrender.com',
  ...
};
```
Phir release build banao (`cd android && ./gradlew assembleRelease`) aur APK alag-alag phones pe install karo — `prod` block release me hi use hota hai (`__DEV__ === false`).

> Bina release build ke (Metro/debug) test karna ho to thodi der ke liye **dev block** me bhi yahi Render URL daal sakte ho.

## Checklist
- [ ] Atlas cluster + Network Access `0.0.0.0/0`
- [ ] `MONGODB_URI` Render me set
- [ ] `FIREBASE_SERVICE_ACCOUNT` (single-line JSON) Render me set
- [ ] `NODE_ENV=production` (render.yaml me hai)
- [ ] `/api/v1/health` 200 de raha hai
- [ ] `env.ts` prod block me live URL
- [ ] Release APK banaya aur phones pe install kiya
