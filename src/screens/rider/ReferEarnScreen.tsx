import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Share, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/api';
import { RADIUS } from '../../constants/theme';
import Card         from '../../components/common/Card';
import Button       from '../../components/common/Button';
import ScreenHeader from '../../components/navigation/ScreenHeader';
import { getMyReferrals } from '../../services/referralService';
import { ReferralFriend, ReferralSummary } from '../../types';
import { useTranslation } from '../../i18n';

const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Rider ka Refer & Earn — invite link / code share karo, dost join kare to wallet me bonus.
// Bonus dost ke pehle completed order par aata hai aur wallet ke "Recent Transactions"
// me "Referral Bonus" naam se dikhta hai.
const ReferEarnScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [data,       setData]       = useState<ReferralSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed,     setFailed]     = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getMyReferrals());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const amount = rupees(data?.rewardPaise ?? 10000);

  const inviteMessage = () => data ? t('refer.shareMessage', { link: data.shareLink, code: data.code }) : '';

  const shareInvite = (message = inviteMessage()) => {
    if (!message) return;
    Share.share({ message, title: t('refer.shareTitle') }, { dialogTitle: t('refer.shareTitle') }).catch(() => {});
  };

  // WhatsApp seedha kholo; app na ho to normal share sheet
  const shareOnWhatsApp = () => {
    const message = inviteMessage();
    if (!message) return;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`).catch(() => shareInvite(message));
  };

  const shareCode = () => {
    if (data) shareInvite(t('refer.codeMessage', { code: data.code, link: data.shareLink }));
  };

  const statusOf = (f: ReferralFriend) => {
    if (f.status === 'rewarded') return { text: `+₹${rupees(f.rewardPaise)}`, color: COLORS.success };
    if (f.status === 'joined')   return { text: t(f.role === 'rider' ? 'refer.statusWaitDelivery' : 'refer.statusWaitBooking'), color: COLORS.textMuted };
    if (f.status === 'pending')  return { text: t('refer.statusPending'), color: COLORS.warning };
    return { text: t(f.rejectReason === 'monthly_limit' ? 'refer.statusLimit' : 'refer.statusRejected'), color: COLORS.textMuted };
  };

  const steps = [
    { icon: '🔗', text: t('refer.step1') },
    { icon: '📲', text: t('refer.step2') },
    { icon: '💰', text: t('refer.step3', { amount }) },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader title={t('refer.title')} subtitle={t('refer.headerSub')} canGoBack onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.secondary]} tintColor={COLORS.secondary} />}>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🎁</Text>
          <Text style={styles.heroTitle}>{t('refer.heroTitle', { amount })}</Text>
          <Text style={styles.heroSub}>{t('refer.heroSub', { amount })}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.secondary} style={{ marginVertical: 24 }} />
        ) : !data ? (
          <Card><Text style={styles.emptyText}>{failed ? t('refer.loadFailed') : ''}</Text></Card>
        ) : !data.enabled ? (
          <View style={styles.pausedBanner}>
            <Text style={styles.pausedText}>{t('refer.paused')}</Text>
          </View>
        ) : (
          <>
            {/* Code + share */}
            <Card style={styles.shareCard}>
              <Text style={styles.codeLabel}>{t('refer.yourCode')}</Text>
              <Pressable onPress={shareCode} style={({ pressed }) => [styles.codeBox, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={t('refer.shareCode')}>
                <Text style={styles.codeText} selectable>{data.code}</Text>
                <Text style={styles.codeShare}>{t('refer.shareCode')}</Text>
              </Pressable>
              <Button title={t('refer.shareLink')} onPress={() => shareInvite()} icon="🔗" style={styles.shareBtn} />
              <Button title={t('refer.whatsapp')} onPress={shareOnWhatsApp} icon="💬" variant="success" />
            </Card>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.secondary }]}>{data.stats.joined}</Text>
                <Text style={styles.statLabel}>{t('refer.statJoined')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.success }]}>₹{rupees(data.stats.earnedPaise)}</Text>
                <Text style={styles.statLabel}>{t('refer.statEarned')}</Text>
              </View>
            </View>
          </>
        )}

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('refer.howItWorks')}</Text>
          <Card>
            {steps.map((s, i) => (
              <View key={s.icon} style={[styles.stepRow, i === steps.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.stepIconChip}><Text style={styles.stepIcon}>{s.icon}</Text></View>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </Card>
        </View>

        {/* Friends */}
        {data?.enabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('refer.yourFriends')}</Text>
            <Card>
              {data.referrals.length === 0 ? (
                <Text style={styles.emptyText}>{t('refer.noFriends')}</Text>
              ) : data.referrals.map((f, i) => {
                const st = statusOf(f);
                return (
                  <View key={f._id} style={[styles.friendRow, i === data.referrals.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendInitial}>{(f.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{f.name}</Text>
                      <Text style={styles.friendMeta}>
                        {t(f.role === 'rider' ? 'refer.asRider' : 'refer.asCustomer')} · {t(f.channel === 'link' ? 'refer.viaLink' : 'refer.viaCode')} · {new Date(f.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                    <Text style={[styles.friendStatus, { color: st.color }]}>{st.text}</Text>
                  </View>
                );
              })}
            </Card>
            <Text style={styles.terms}>
              {data.monthlyLimit > 0 ? t('refer.terms', { limit: data.monthlyLimit }) : t('refer.termsNoLimit')}
            </Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  hero: {
    backgroundColor: COLORS.secondary, borderRadius: 20, padding: 24, alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  heroEmoji: { fontSize: 40, marginBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -0.3 },
  heroSub:   { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 8, lineHeight: 19 },

  shareCard: { marginBottom: 16 },
  codeLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  codeBox: {
    marginTop: 10, marginBottom: 16, paddingVertical: 14, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondaryBg, alignItems: 'center',
  },
  codeText:  { fontSize: 26, fontWeight: '900', color: COLORS.secondary, letterSpacing: 4 },
  codeShare: { fontSize: 11.5, fontWeight: '700', color: COLORS.secondary, marginTop: 4, opacity: 0.8 },
  shareBtn:  { marginBottom: 10 },

  statsRow: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 20, fontWeight: '900', marginBottom: 3 },
  statLabel:   { fontSize: 11.5, color: COLORS.textMuted },
  statDivider: { width: 1, backgroundColor: COLORS.border },

  pausedBanner: {
    backgroundColor: COLORS.warningBg, borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.warning + '40',
  },
  pausedText: { fontSize: 13, fontWeight: '600', color: COLORS.warning, lineHeight: 18 },

  section:      { marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 10 },

  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  stepIconChip: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.secondaryBg, alignItems: 'center', justifyContent: 'center' },
  stepIcon:     { fontSize: 17 },
  stepText:     { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18, fontWeight: '600' },

  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8, lineHeight: 18 },

  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  friendAvatar:  { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.secondaryBg, alignItems: 'center', justifyContent: 'center' },
  friendInitial: { fontSize: 15, fontWeight: '800', color: COLORS.secondary },
  friendName:    { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  friendMeta:    { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  friendStatus:  { fontSize: 12.5, fontWeight: '800', maxWidth: '45%', textAlign: 'right' },

  terms: { fontSize: 11.5, color: COLORS.textLight, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});

export default ReferEarnScreen;
