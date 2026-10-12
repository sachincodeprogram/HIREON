import { Vibration } from 'react-native';
import notifee, { AndroidImportance, AndroidStyle, AndroidVisibility } from '@notifee/react-native';
import { COLORS } from '../constants/api';
import { translate, loadSavedLanguage } from '../i18n';

// Ek order ka cancel alert sirf EK baar — ActiveDelivery aur Navigation dono
// screens ek saath mounted ho sakti hain aur dono ko same socket event milta hai.
const alerted = new Set<string>();

const CHANNEL_ID = 'order_updates';

// Customer ne order cancel kar diya — rider ko turant bata do: phone vibrate
// karo aur tray me notification daalo (app background me ho aur socket abhi
// zinda ho to bhi rider ko pata chal jaaye). Kabhi throw nahi karta.
export const notifyOrderCancelled = async (orderId: string, displayId?: string): Promise<void> => {
  if (!orderId || alerted.has(orderId)) return;
  alerted.add(orderId);

  try { Vibration.vibrate([0, 400, 200, 400, 200, 600]); } catch { /* noop */ }

  try {
    // App band thi (FCM background handler) to bhasha abhi load nahi hui hogi.
    await loadSavedLanguage();
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: translate('cancel.channel'),
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibration: true,
    });
    const body = translate('cancel.notifBody', { id: displayId || orderId.slice(-6) });
    await notifee.displayNotification({
      id: `cancel_${orderId}`,
      title: translate('cancel.notifTitle'),
      body,
      data: { type: 'order_cancelled', orderId },
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        color: COLORS.error,
        smallIcon: 'ic_stat_hireon',
        style: { type: AndroidStyle.BIGTEXT, text: body },
        timestamp: Date.now(),
        showTimestamp: true,
        pressAction: { id: 'default', launchActivity: 'default' },
        autoCancel: true,
      },
    });
  } catch (e) {
    console.warn('[CANCEL-NOTIF] display failed:', (e as Error)?.message);
  }
};

// Is order ka cancel alert pehle hi dikh chuka? (dusri screen dobara na dikhaye)
export const wasCancelAlerted = (orderId: string): boolean => alerted.has(orderId);

// Rider ne app me cancel card dekh liya ("Dashboard pe jao") — tray me padi
// usi order ki notification hata do, warna purane cancel alerts jama hote rehte.
export const clearCancelNotification = (orderId?: string): void => {
  if (!orderId) return;
  notifee.cancelNotification(`cancel_${orderId}`).catch(() => {});
};
