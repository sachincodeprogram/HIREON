import axios from 'axios';
import auth  from '@react-native-firebase/auth';
import { BASE_URL } from '../constants/api';

// 60s timeout: Render free tier 15 min idle ke baad sleep ho jaata hai aur
// pehli request ~50s (cold start) leti hai. 15s pe timeout hone se existing
// user galti se Signup pe chala jaata tha / registration fail ho jaata tha.
const apiClient = axios.create({ baseURL: BASE_URL, timeout: 60000 });

// Dev mode mein phone number store karo (Firebase bypass ke liye)
let _devPhone: string | null = null;
export const setDevPhone   = (phone: string) => { _devPhone = phone; };
export const clearDevPhone = () => { _devPhone = null; };
export const getDevPhone   = () => _devPhone;

apiClient.interceptors.request.use(async (config) => {
  if (__DEV__ && _devPhone) {
    config.headers.Authorization = `Bearer dev:${_devPhone}`;
    return config;
  }
  const currentUser = auth().currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Admin ne account block kiya — backend har request par 403 ACCOUNT_BLOCKED deta hai
// (socket bhi "Account blocked" se reject hota hai). RootNavigator yahan sunta hai
// aur turant "Account blocked" screen dikhata hai.
type BlockedListener = () => void;
const blockedListeners = new Set<BlockedListener>();
export const onAccountBlocked = (fn: BlockedListener): (() => void) => {
  blockedListeners.add(fn);
  return () => { blockedListeners.delete(fn); };
};
export const notifyAccountBlocked = () => {
  blockedListeners.forEach(fn => { try { fn(); } catch { /* listener error ignore */ } });
};

apiClient.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 403 && err.response?.data?.data?.code === 'ACCOUNT_BLOCKED') {
      notifyAccountBlocked();
    }
    const e: any = new Error(err.response?.data?.message || err.message);
    // HTTP status bhi saath rakho — callers 404 (profile nahi) aur
    // network/timeout error me farq kar saken.
    e.status = err.response?.status;
    e.code   = err.code;
    return Promise.reject(e);
  },
);

export default apiClient;
