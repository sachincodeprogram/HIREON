const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Sirf ek baar initialize karo
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'hireon-8e1c0' });
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      console.log('[Firebase] Using Auth Emulator at', process.env.FIREBASE_AUTH_EMULATOR_HOST);
    } else {
      console.warn('[Firebase] No service account — set FIREBASE_SERVICE_ACCOUNT for production');
    }
  }
}

// auth() return karo taaki baaki files use kar sakein
module.exports = { auth: getAuth };
