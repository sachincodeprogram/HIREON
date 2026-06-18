import AsyncStorage from '@react-native-async-storage/async-storage';
import { RINGTONE_STORAGE_KEY, DEFAULT_RINGTONE_ID } from '../constants/ringtones';

// Rider's chosen new-order ringtone is stored locally (per device).
export const getSavedRingtoneId = async (): Promise<string> => {
  try {
    return (await AsyncStorage.getItem(RINGTONE_STORAGE_KEY)) || DEFAULT_RINGTONE_ID;
  } catch {
    return DEFAULT_RINGTONE_ID;
  }
};

export const saveRingtoneId = async (id: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(RINGTONE_STORAGE_KEY, id);
  } catch {
    /* ignore persist errors */
  }
};
