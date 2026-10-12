import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { COLORS } from '../../constants/api';
import useAppSelector from '../../hooks/useAppSelector';
import { useTranslation } from '../../i18n';
import { getMySupportTickets } from '../../services/supportService';
import { SupportTicketSummary } from '../../types';
import { formatDate, formatTime } from '../../utils/formatters';
import ScreenHeader from '../../components/navigation/ScreenHeader';
import Button from '../../components/common/Button';
import { faqsFor, HeadsetIcon, STATUS_STYLE, topicFor } from './supportConfig';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// Help & Support ka pehla screen — nayi baat shuru karo ya purane tickets dekho.
const SupportHomeScreen = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const role = useAppSelector(s => s.auth.profile?.role);
  const accent = role === 'rider' ? COLORS.secondary : COLORS.primary;
  const accentBg = role === 'rider' ? COLORS.secondaryBg : COLORS.primaryBg;

  const [tickets, setTickets] = useState<SupportTicketSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await getMySupportTickets());
      setFailed(false);
    } catch {
      setFailed(true);
      setTickets(prev => prev ?? []);
    }
  }, []);

  // Chat se wapas aane par list taaza (naya ticket / naya jawab)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderTicket = (tk: SupportTicketSummary) => {
    const topic  = topicFor(role, tk.category);
    const status = STATUS_STYLE[tk.status] ?? STATUS_STYLE.open;
    const last   = tk.lastMessage;
    // System notes ("Ticket created") ki jagah user ki asli baat dikhao
    const preview = !last || last.sender === 'system' ? tk.subject
      : last.sender === 'user' ? `${t('support.you')}: ${last.text}`
      : last.text;
    return (
      <TouchableOpacity
        key={tk._id}
        style={styles.ticket}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SupportChat', { ticketId: tk._id })}>
        <View style={[styles.ticketIcon, { backgroundColor: accentBg }]}>
          <Text style={styles.ticketIconText}>{topic.icon}</Text>
        </View>
        <View style={styles.ticketBody}>
          <View style={styles.ticketTop}>
            <Text style={styles.ticketNo}>{tk.ticketNo}</Text>
            <Text style={styles.ticketTime}>
              {isToday(tk.lastMessageAt) ? formatTime(tk.lastMessageAt) : formatDate(tk.lastMessageAt)}
            </Text>
          </View>
          <Text style={styles.ticketTopic} numberOfLines={1}>
            {t(topic.label)}{tk.orderCode ? `  ·  #${tk.orderCode}` : ''}
          </Text>
          <View style={styles.ticketBottom}>
            <Text style={[styles.ticketPreview, tk.userUnread && styles.ticketPreviewUnread]} numberOfLines={1}>
              {preview}
            </Text>
            {tk.userUnread ? <View style={[styles.unreadDot, { backgroundColor: accent }]} /> : null}
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.fg }]}>{t(status.label)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader
        title={t('support.title')}
        subtitle={t('support.subtitle')}
        canGoBack
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} />}>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: accentBg }]}>
            <HeadsetIcon size={28} color={accent} />
          </View>
          <Text style={styles.heroTitle}>{t('support.heroTitle')}</Text>
          <Text style={styles.heroSub}>{t('support.heroSub')}</Text>
          <Button
            title={t('support.newChat')}
            onPress={() => navigation.navigate('SupportChat', {})}
            size="lg"
            style={{ ...styles.heroBtn, backgroundColor: accent, shadowColor: accent }}
          />
        </View>

        {/* Tickets — sirf jab kuch ho (ya load fail) */}
        {tickets === null ? (
          <ActivityIndicator color={accent} style={{ marginTop: 24 }} />
        ) : tickets.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t('support.myTickets')}</Text>
            <View style={styles.list}>{tickets.map(renderTicket)}</View>
          </>
        ) : failed ? (
          <Text style={styles.failText}>{t('support.loadFailed')}</Text>
        ) : null}

        {/* Quick answers (FAQ) */}
        <Text style={styles.sectionTitle}>{t('support.quickHelp')}</Text>
        <Text style={styles.sectionSub}>{t('support.quickHelpSub')}</Text>
        <View style={styles.faqCard}>
          {faqsFor(role).map((f, i, all) => {
            const open = openFaq === i;
            return (
              <View key={f.q} style={[styles.faqItem, i === all.length - 1 && styles.faqItemLast]}>
                <TouchableOpacity
                  style={styles.faqQ}
                  activeOpacity={0.7}
                  onPress={() => setOpenFaq(open ? null : i)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}>
                  <Text style={[styles.faqQText, open && { color: accent }]}>{t(f.q)}</Text>
                  <Text style={[styles.faqChevron, open && { color: accent, transform: [{ rotate: '90deg' }] }]}>›</Text>
                </TouchableOpacity>
                {open && <Text style={styles.faqA}>{t(f.a)}</Text>}
              </View>
            );
          })}
        </View>

        {/* Still need help */}
        <View style={[styles.stillCard, { backgroundColor: accentBg }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stillTitle}>{t('support.stillNeed')}</Text>
            <Text style={styles.stillSub}>{t('support.stillNeedSub')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.stillBtn, { backgroundColor: accent }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SupportChat', {})}>
            <HeadsetIcon size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 16, paddingBottom: 40 },

  hero: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  heroIcon:  { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  heroSub:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  heroBtn:   { alignSelf: 'stretch', marginTop: 16 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 24, marginBottom: 10 },
  list: { gap: 10 },

  ticket: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  ticketIcon:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ticketIconText: { fontSize: 20 },
  ticketBody:     { flex: 1 },
  ticketTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketNo:       { fontSize: 13, fontWeight: '800', color: COLORS.text, letterSpacing: 0.3 },
  ticketTime:     { fontSize: 11, color: COLORS.textLight },
  ticketTopic:    { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  ticketBottom:   { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  ticketPreview:  { flex: 1, fontSize: 13, color: COLORS.textMuted },
  ticketPreviewUnread: { color: COLORS.text, fontWeight: '700' },
  unreadDot:      { width: 8, height: 8, borderRadius: 4 },

  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '800' },

  failText:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 20 },
  sectionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: -6, marginBottom: 10 },

  faqCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  faqItem:     { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  faqItemLast: { borderBottomWidth: 0 },
  faqQ:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  faqQText:    { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  faqChevron:  { fontSize: 24, color: COLORS.textLight, fontWeight: '300', width: 16, textAlign: 'center' },
  faqA:        { fontSize: 13, color: COLORS.textMuted, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 14, marginTop: -4 },

  stillCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, marginTop: 16 },
  stillTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  stillSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 17 },
  stillBtn:   { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});

export default SupportHomeScreen;
