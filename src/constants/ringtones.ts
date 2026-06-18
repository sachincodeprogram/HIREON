// Rider new-order ringtones. Files live in android/app/src/main/res/raw/<file>.
// On Android react-native-sound strips the extension; keep names lowercase.

export interface Ringtone {
  id: string;
  label: string;
  file: string;
  emoji: string;
}

export const RINGTONES: Ringtone[] = [
  { id: 'ring_1',  label: 'Classic Beep',    file: 'ring_1.wav',  emoji: '🔔' },
  { id: 'ring_2',  label: 'Doorbell',        file: 'ring_2.wav',  emoji: '🚪' },
  { id: 'ring_3',  label: 'Rising Arpeggio', file: 'ring_3.wav',  emoji: '📈' },
  { id: 'ring_4',  label: 'Triple Pulse',    file: 'ring_4.wav',  emoji: '⚡' },
  { id: 'ring_5',  label: 'Marimba',         file: 'ring_5.wav',  emoji: '🎵' },
  { id: 'ring_6',  label: 'Siren',           file: 'ring_6.wav',  emoji: '🚨' },
  { id: 'ring_7',  label: 'Digital Blips',   file: 'ring_7.wav',  emoji: '🤖' },
  { id: 'ring_8',  label: 'Soft Chime',      file: 'ring_8.wav',  emoji: '🎐' },
  { id: 'ring_9',  label: 'Urgent Alert',    file: 'ring_9.wav',  emoji: '⏰' },
  { id: 'ring_10', label: 'Happy Tune',      file: 'ring_10.wav', emoji: '🎶' },
];

export const DEFAULT_RINGTONE_ID = 'ring_1';
export const RINGTONE_STORAGE_KEY = '@hireon/rider_ringtone';

export const getRingtoneById = (id?: string | null): Ringtone =>
  RINGTONES.find(r => r.id === id) || RINGTONES[0];
