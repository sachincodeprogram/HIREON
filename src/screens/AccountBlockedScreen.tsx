import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import auth from '@react-native-firebase/auth';
import { COLORS } from '../constants/api';
import { SPACING, RADIUS, TYPE } from '../constants/theme';
import Button from '../components/common/Button';
import useAppSelector from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { setProfile, clearAuth } from '../store/slices/authSlice';
import { getMyProfile } from '../services/authService';
import { clearDevPhone } from '../services/apiClient';
import { disconnectSocket } from '../services/socketService';
import { useTranslation } from '../i18n';

// Admin ne account block kiya hai — sirf yeh screen dikhao. Har 30s (aur app
// foreground aane par) status check karo; unblock hote hi profile update hogi aur
// RootNavigator apne aap wapas Customer/Rider screens par le jayega.
const CHECK_EVERY_MS = 30000;

const AccountBlockedScreen = () => {
  const dispatch = useAppDispatch();
  const { t }    = useTranslation();
  const profile  = useAppSelector(s => s.auth.profile);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const busy = useRef(false);

  const checkStatus = useCallback(async (manual = false) => {
    if (busy.current) return;
    busy.current = true;
    if (manual) { setChecking(true); setNote(''); }
    try {
      const p = await getMyProfile();
      dispatch(setProfile(p));
      if (manual && p.isBlocked) setNote(t('blocked.stillBlocked'));
    } catch {
      if (manual) setNote(t('blocked.checkFailed'));
    } finally {
      busy.current = false;
      if (manual) setChecking(false);
    }
  }, [dispatch, t]);

  useEffect(() => {
    // Blocked user ka live connection band — server waise bhi reject karta hai
    disconnectSocket();
    const timer = setInterval(() => { if (AppState.currentState === 'active') checkStatus(); }, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') checkStatus(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [checkStatus]);

  const handleLogout = async () => {
    clearDevPhone();
    try { await auth().signOut(); } catch {}
    dispatch(clearAuth());
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={COLORS.error} strokeWidth={2} strokeLinecap="round">
            <Circle cx={12} cy={12} r={9} />
            <Path d="m5.6 5.6 12.8 12.8" />
          </Svg>
        </View>

        <Text style={styles.title}>{t('blocked.title')}</Text>
        <Text style={styles.subtitle}>
          {profile?.name ? t('blocked.msgNamed', { name: profile.name.split(' ')[0] }) : t('blocked.msg')}
          You can't book or deliver orders right now.
        </Text>

        {!!profile?.blockReason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>{t('blocked.reason')}</Text>
            <Text style={styles.reasonText}>{profile.blockReason}</Text>
          </View>
        )}

        <Text style={styles.help}>
          {t('blocked.help')}
        </Text>
      </View>

      <View style={styles.footer}>
        {!!note && <Text style={styles.note}>{note}</Text>}
        <Button title={t('blocked.checkAgain')} onPress={() => checkStatus(true)} loading={checking} size="lg" />
        <Button title={t('profile.logout')} onPress={handleLogout} variant="ghost" style={styles.logout} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: COLORS.background },
  body:     { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.xxl },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: SPACING.xl,
  },
  title:    { ...TYPE.h1, color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  reasonBox: {
    marginTop: SPACING.xl, padding: SPACING.lg, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  reasonLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText:  { fontSize: 15, lineHeight: 21, color: COLORS.text, marginTop: SPACING.xs },
  help:     { fontSize: 13, lineHeight: 19, color: COLORS.textLight, textAlign: 'center', marginTop: SPACING.xl },
  footer:   { paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.xl },
  note:     { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.md },
  logout:   { marginTop: SPACING.sm },
});

export default AccountBlockedScreen;
