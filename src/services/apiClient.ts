import axios from 'axios';
import auth  from '@react-native-firebase/auth';
import { BASE_URL } from '../constants/api';

const apiClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

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

apiClient.interceptors.response.use(
  res => res,
  err => Promise.reject(new Error(err.response?.data?.message || err.message)),
);

export default apiClient;
