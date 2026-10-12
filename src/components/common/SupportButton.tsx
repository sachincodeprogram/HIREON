import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { COLORS } from '../../constants/api';
import { useTranslation } from '../../i18n';
import { getMySupportTickets } from '../../services/supportService';
import { HeadsetIcon } from '../../screens/support/supportConfig';

// Dashboard ka floating "Support" button — neeche right me, Profile tab ke
// theek upar (jaise professional apps ka help launcher). Support team ka naya
// jawab ho to badge dikhta hai (screen focus par check hota hai).
const SupportButton: React.FC<{ accent?: string }> = ({ accent = COLORS.primary }) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [unread, setUnread] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 60, delay: 250, useNativeDriver: true }).start();
  }, [enter]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getMySupportTickets()
      .then(list => { if (active) setUnread(list.some(x => x.userUnread)); })
      .catch(() => { /* backend purana / offline — badge mat dikhao */ });
    return () => { active = false; };
  }, []));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.fabWrap, {
        opacity: enter,
        transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }]}>
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accent, shadowColor: accent }]}
        onPress={() => navigation.navigate('Support')}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={t('support.title')}>
        <HeadsetIcon size={20} color="#fff" />
        <Text style={styles.fabLabel}>{t('support.button')}</Text>
      </TouchableOpacity>
      {unread && <View style={[styles.badge, { borderColor: COLORS.surface }]} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', right: 16, bottom: 18 },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 50, paddingLeft: 16, paddingRight: 20, borderRadius: 25,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  fabLabel: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  badge: {
    position: 'absolute', top: -2, right: 2, width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.error, borderWidth: 2.5,
  },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon:  { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowArrow: { fontSize: 26, color: COLORS.textLight, fontWeight: '300' },
});

/** Profile screen ka "Help & Support" row. */
export const SupportSettingRow: React.FC<{ accent?: string; bg?: string }> = ({ accent = COLORS.primary, bg = COLORS.primaryBg }) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Support')} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>
        <HeadsetIcon size={22} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{t('support.rowTitle')}</Text>
        <Text style={styles.rowSub}>{t('support.rowSub')}</Text>
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
};

export default SupportButton;
