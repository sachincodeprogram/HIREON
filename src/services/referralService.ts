import { Platform } from 'react-native';
import { getInstallReferrer } from 'react-native-device-info';
import apiClient from './apiClient';
import { ReferralSummary } from '../types';

export const getMyReferrals = async (): Promise<ReferralSummary> => {
  const { data } = await apiClient.get('/referrals/me');
  return data.data;
};

export const validateReferralCode = async (code: string): Promise<{ valid: boolean; code?: string; referrerName?: string }> => {
  const { data } = await apiClient.post('/referrals/validate', { code });
  return data.data;
};

// Code sirf A-Z/0-9, upper case — user "sach-7k2q " likhe to bhi "SACH7K2Q"
export const normalizeReferralCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// Invite link Play Store par `referrer=utm_source=...&ref=CODE` bhejta hai. Install ke
// baad Play Install Referrer API wahi string deta hai — usme se code nikaalo.
// Organic install / sideload / iOS par null (user code khud daal sakta hai).
export const getInstallReferralCode = async (): Promise<string | null> => {
  if (Platform.OS !== 'android') return null;
  try {
    const raw = await getInstallReferrer();
    if (!raw || raw === 'unknown') return null;
    const decoded = raw.includes('%') ? decodeURIComponent(raw) : raw;
    const match = decoded.match(/(?:^|&)ref=([A-Za-z0-9]{6,12})(?:&|$)/);
    return match ? normalizeReferralCode(match[1]) : null;
  } catch {
    return null; // Play Store service na mile to bhi signup chalta rahe
  }
};

// Profile/Wallet ke chhote banners ke liye — asli amount server se aata hai
// (GET /referrals/me → rewardPaise), Refer screen wahi dikhata hai.
export const REFERRAL_REWARD_RUPEES = 100;
