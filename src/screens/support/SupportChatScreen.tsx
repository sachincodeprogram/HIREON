import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../../constants/api';
import useAppSelector from '../../hooks/useAppSelector';
import { useTranslation } from '../../i18n';
import { createSupportTicket, getSupportTicket, sendSupportMessage } from '../../services/supportService';
import { getMyOrders } from '../../services/orderService';
import { Order, SupportCategory, SupportMessage, SupportTicket } from '../../types';
import { formatDate, formatDateTime, formatTime, truncateAddress } from '../../utils/formatters';
import ScreenHeader from '../../components/navigation/ScreenHeader';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import { SendIcon, STATUS_STYLE, systemText, topicFor, topicsFor } from './supportConfig';

type Route = RouteProp<{ SupportChat: { ticketId?: string } }, 'SupportChat'>;

const POLL_MS = 12000;
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const stamp = (iso: string) => (isToday(iso) ? formatTime(iso) : formatDateTime(iso));

// Support chat — naya ticket (topic → order → details) ya purane ticket ki
// poori baatcheet. Khula rehne par har 12s me naye jawab le aata hai.
const SupportChatScreen = () => {
  const route      = useRoute<Route>();
  const navigation = useNavigation<any>();
  const { t }      = useTranslation();
  const profile    = useAppSelector(s => s.auth.profile);
  const role       = profile?.role;
  const accent     = role === 'rider' ? COLORS.secondary : COLORS.primary;
  const accentBg   = role === 'rider' ? COLORS.secondaryBg : COLORS.primaryBg;
  const firstName  = profile?.name?.split(' ')[0] || '';

  const scrollRef = useRef<ScrollView>(null);
  const [ticketId, setTicketId] = useState<string | undefined>(route.params?.ticketId);
  const [ticket,   setTicket]   = useState<SupportTicket | null>(null);
  const [loading,  setLoading]  = useState(!!route.params?.ticketId);
  const [loadFailed, setLoadFailed] = useState(false);

  // Naya ticket flow
  const [topic,  setTopic]  = useState<SupportCategory | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  // undefined = abhi chuna nahi, null = "order se juda nahi"
  const [orderChoice, setOrderChoice] = useState<Order | null | undefined>(undefined);

  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);

  const isNew = !ticketId;

  // Ticket load + polling (sirf jab screen samne ho)
  useFocusEffect(useCallback(() => {
    if (!ticketId) return;
    let active = true;
    const fetchTicket = () => getSupportTicket(ticketId)
      .then(tk => { if (active) { setTicket(tk); setLoadFailed(false); } })
      .catch(() => { if (active) setLoadFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    fetchTicket();
    const iv = setInterval(fetchTicket, POLL_MS);
    return () => { active = false; clearInterval(iv); };
  }, [ticketId]));

  // Naye ticket ke liye haal ke orders (order chunne ke liye)
  useEffect(() => {
    if (ticketId) return;
    getMyOrders()
      .then(list => setOrders(list.slice(0, 5)))
      .catch(() => setOrders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Koi order hi nahi — order wala sawaal chhod do
  useEffect(() => {
    if (topic && orders && orders.length === 0 && orderChoice === undefined) setOrderChoice(null);
  }, [topic, orders, orderChoice]);

  const canType = isNew
    ? !!topic && orderChoice !== undefined
    : !!ticket && ticket.status !== 'closed';

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending || !canType) return;
    if (isNew && msg.length < 5) {
      Alert.alert(t('support.title'), t('support.minChars'));
      return;
    }
    setSending(true);
    try {
      const tk = isNew
        ? await createSupportTicket({ category: topic!, message: msg, orderId: orderChoice?._id })
        : await sendSupportMessage(ticketId!, msg);
      setTicket(tk);
      setText('');
      if (isNew) {
        setTicketId(tk._id);
        navigation.setParams({ ticketId: tk._id });
      }
    } catch (e: any) {
      Alert.alert(t('support.sendFailed'), e?.message || '');
    } finally {
      setSending(false);
    }
  };

  const resetTopic = () => { setTopic(null); setOrderChoice(undefined); };

  // ── Bubbles ──
  const agentBubble = (children: React.ReactNode, time?: string, key?: string) => (
    <View key={key} style={styles.agentRow}>
      <View style={[styles.agentAvatar, { backgroundColor: accent }]}>
        <Text style={styles.agentAvatarText}>H</Text>
      </View>
      <View style={styles.agentCol}>
        <Text style={styles.agentName}>{t('support.agentName')}</Text>
        <View style={styles.agentBubble}>
          {typeof children === 'string' ? <Text style={styles.agentText}>{children}</Text> : children}
        </View>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );

  const userBubble = (body: string, time?: string, onEdit?: () => void, key?: string) => (
    <View key={key} style={styles.userRow}>
      <View style={[styles.userBubble, { backgroundColor: accent }]}>
        <Text style={styles.userText}>{body}</Text>
      </View>
      <View style={styles.userMeta}>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={8}>
            <Text style={[styles.editLink, { color: accent }]}>✎</Text>
          </TouchableOpacity>
        ) : null}
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );

  const renderMessage = (m: SupportMessage) => {
    if (m.sender === 'user') return userBubble(m.text, stamp(m.createdAt), undefined, m._id);
    if (m.sender === 'support') return agentBubble(m.text, stamp(m.createdAt), m._id);
    const created = /^Ticket (\S+) created$/.exec(m.text);
    if (created) {
      return (
        <View key={m._id} style={styles.createdCard}>
          <View style={styles.createdIcon}><Text style={styles.createdIconText}>✓</Text></View>
          <Text style={styles.createdTitle}>{t('support.created', { no: created[1] })}</Text>
          <Text style={styles.createdSub}>{t('support.createdMsg', { no: created[1] })}</Text>
        </View>
      );
    }
    return (
      <View key={m._id} style={styles.systemRow}>
        <Text style={styles.systemText}>{systemText(m.text, t)} · {stamp(m.createdAt)}</Text>
      </View>
    );
  };

  const renderNewFlow = () => {
    const topics = topicsFor(role);
    const chosen = topic ? topicFor(role, topic) : null;
    return (
      <>
        {agentBubble(t('support.greeting', { name: firstName }))}
        {!chosen ? (
          <View style={styles.options}>
            {topics.map(o => (
              <TouchableOpacity key={o.key} style={styles.option} activeOpacity={0.8} onPress={() => setTopic(o.key)}>
                <View style={[styles.optionIcon, { backgroundColor: accentBg }]}><Text style={styles.optionIconText}>{o.icon}</Text></View>
                <Text style={styles.optionText}>{t(o.label)}</Text>
                <Text style={styles.optionArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          userBubble(`${chosen.icon}  ${t(chosen.label)}`, undefined, !sending ? resetTopic : undefined)
        )}

        {chosen && orders === null && <ActivityIndicator color={accent} style={styles.typing} />}

        {chosen && orders && orders.length > 0 && (
          <>
            {agentBubble(t('support.askOrder'))}
            {orderChoice === undefined ? (
              <View style={styles.options}>
                {orders.map(o => (
                  <TouchableOpacity key={o._id} style={styles.option} activeOpacity={0.8} onPress={() => setOrderChoice(o)}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.orderTop}>
                        <Text style={styles.orderCode}>#{o.orderId}</Text>
                        <StatusBadge status={o.status} />
                      </View>
                      <Text style={styles.orderSub} numberOfLines={1}>
                        {formatDate(o.createdAt)} · {truncateAddress(o.delivery.address, 34)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.option} activeOpacity={0.8} onPress={() => setOrderChoice(null)}>
                  <Text style={[styles.optionText, { color: COLORS.textMuted }]}>{t('support.notOrder')}</Text>
                  <Text style={styles.optionArrow}>›</Text>
                </TouchableOpacity>
              </View>
            ) : (
              userBubble(
                orderChoice ? `${t('support.order')} #${orderChoice.orderId}` : t('support.notOrder'),
                undefined,
                !sending ? () => setOrderChoice(undefined) : undefined,
              )
            )}
          </>
        )}

        {chosen && orderChoice !== undefined && agentBubble(t('support.askDetails'))}
      </>
    );
  };

  const status = ticket ? STATUS_STYLE[ticket.status] ?? STATUS_STYLE.open : null;
  const headerSub = ticket
    ? `${t(status!.label)} · ${t(topicFor(role, ticket.category).label)}`
    : t('support.subtitle');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader
        title={ticket ? ticket.ticketNo : t('support.title')}
        subtitle={headerSub}
        canGoBack
        onBack={() => navigation.goBack()}
      />

      {/* Android edge-to-edge par adjustResize kaam nahi karta — padding dono
          platform par; KAV sirf asli overlap jitna hi padding deta hai. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {ticket?.orderCode ? (
            <View style={styles.contextChip}>
              <Text style={styles.contextText}>{t('support.order')} #{ticket.orderCode}</Text>
            </View>
          ) : null}

          {isNew ? renderNewFlow()
            : loading ? <ActivityIndicator color={accent} style={styles.typing} />
            : ticket ? ticket.messages.map(renderMessage)
            : <Text style={styles.failText}>{loadFailed ? t('support.loadFailed') : ''}</Text>}
        </ScrollView>

        {ticket?.status === 'resolved' && (
          <View style={[styles.note, { backgroundColor: COLORS.successBg }]}>
            <Text style={[styles.noteText, { color: COLORS.success }]}>✓ {t('support.resolvedNote')}</Text>
          </View>
        )}

        {ticket?.status === 'closed' ? (
          <View style={styles.closedBox}>
            <Text style={styles.closedText}>{t('support.closedNote')}</Text>
            <Button
              title={t('support.newChat')}
              onPress={() => navigation.replace('SupportChat', {})}
              style={{ backgroundColor: accent, shadowColor: accent, marginTop: 10 }}
            />
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={[styles.input, !canType && styles.inputDisabled]}
              value={text}
              onChangeText={setText}
              placeholder={isNew ? t('support.placeholderFirst') : t('support.placeholder')}
              placeholderTextColor={COLORS.textLight}
              editable={canType && !sending}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: canType && text.trim() ? accent : COLORS.borderDark }]}
              onPress={send}
              disabled={!canType || !text.trim() || sending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Send">
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <SendIcon size={19} />}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex:      { flex: 1 },
  thread:    { padding: 16, paddingBottom: 24, gap: 12 },
  typing:    { alignSelf: 'flex-start', marginLeft: 44 },
  failText:  { textAlign: 'center', color: COLORS.textMuted, marginTop: 24 },

  contextChip: {
    alignSelf: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  contextText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  agentRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, maxWidth: '88%' },
  agentAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  agentAvatarText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  agentCol:        { flexShrink: 1 },
  agentName:       { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 3, marginLeft: 2 },
  agentBubble: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderTopLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  agentText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },

  userRow:    { alignSelf: 'flex-end', maxWidth: '82%', alignItems: 'flex-end' },
  userBubble: { borderRadius: 16, borderTopRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  userText:   { fontSize: 14, color: '#fff', lineHeight: 20 },
  userMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editLink:   { fontSize: 13, fontWeight: '800', marginTop: 3 },
  time:       { fontSize: 10, color: COLORS.textLight, marginTop: 3, marginHorizontal: 2 },

  options: {
    marginLeft: 42, backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  optionIcon:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optionIconText: { fontSize: 16 },
  optionText:     { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  optionArrow:    { fontSize: 22, color: COLORS.textLight, fontWeight: '300' },
  orderTop:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderCode:      { fontSize: 13, fontWeight: '800', color: COLORS.text },
  orderSub:       { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  createdCard: {
    alignSelf: 'center', width: '92%', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.success + '40',
  },
  createdIcon:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  createdIconText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  createdTitle:    { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  createdSub:      { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19, marginTop: 4 },

  systemRow:  { alignSelf: 'center', backgroundColor: COLORS.surface2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  systemText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  note:     { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 10 },
  noteText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  closedBox:  { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  closedText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: COLORS.background, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 14, color: COLORS.text,
  },
  inputDisabled: { opacity: 0.55 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

export default SupportChatScreen;
