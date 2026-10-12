import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/api';
import { Order } from '../../types';
import { TranslationKey, useTranslation } from '../../i18n';
import { formatTime } from '../../utils/formatters';
import Button from './Button';

interface Props {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
}

const SHEET_OFFSET = Dimensions.get('window').height;

const CrossIcon = () => (
  <Svg width={28} height={28} viewBox="0 0 24 24">
    <Path d="M7 7l10 10M17 7L7 17" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
  </Svg>
);

const CheckIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={color} />
    <Path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Rider pickup ke raaste me ho aur customer order cancel kar de — neeche se
// aane wali "live activity" sheet: kya hua, kab hua, kisne kiya, aur aage kya
// karna hai. Hardware back / button dono dashboard par le jaate hain.
const OrderCancelledOverlay: React.FC<Props> = ({ visible, order, onClose }) => {
  const { t } = useTranslation();
  // Edge-to-edge par sheet navigation bar ke peeche na chhupe
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const ring  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, friction: 9, tension: 55, useNativeDriver: true }).start();
    const loops = Animated.parallel([
      Animated.loop(Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])),
      Animated.loop(
        Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ]);
    loops.start();
    return () => { loops.stop(); blink.setValue(1); ring.setValue(0); };
  }, [visible, slide, blink, ring]);

  const by = order?.cancelledBy;
  const message = by === 'customer' ? t('cancel.byCustomer')
    : by === 'admin' ? t('cancel.byAdmin') : t('cancel.byOther');
  const byLabel: TranslationKey = by === 'customer' ? 'role.customer'
    : by === 'admin' ? 'cancel.support' : 'cancel.system';

  // Cancel ka asli waqt timeline se — na mile to updatedAt.
  const cancelEntry = order?.timeline?.slice().reverse().find(e => e.status === 'cancelled');
  const cancelledAtIso = cancelEntry?.timestamp || order?.updatedAt;
  const cancelledAt = cancelledAtIso ? formatTime(cancelledAtIso) : '';

  // Customer app ka default note dikhane layak nahi — sirf asli reason dikhao.
  const note = order?.cancellationNote && order.cancellationNote !== 'Cancelled by customer'
    ? order.cancellationNote : '';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.sheet, {
            paddingBottom: 20 + insets.bottom,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [SHEET_OFFSET * 0.6, 0] }) }],
          }]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Animated.View
                style={[styles.iconRing, {
                  opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                  transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                }]}
              />
              <View style={styles.iconCircle}><CrossIcon /></View>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('cancel.title')}</Text>
              {cancelledAt ? (
                <Text style={styles.subtitle}>{t('cancel.at', { time: cancelledAt })}</Text>
              ) : null}
            </View>
            <View style={styles.liveChip}>
              <Animated.View style={[styles.liveDot, { opacity: blink }]} />
              <Text style={styles.liveText}>{t('cancel.live')}</Text>
            </View>
          </View>

          <Text style={styles.message}>{message}</Text>

          {/* Details */}
          {order ? (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('cancel.orderId')}</Text>
                <Text style={styles.rowValue}>#{order.orderId}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('cancel.cancelledBy')}</Text>
                <Text style={styles.rowValue}>{t(byLabel)}</Text>
              </View>
              {note ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('cancel.reason')}</Text>
                  <Text style={[styles.rowValue, styles.rowValueWrap]} numberOfLines={2}>{note}</Text>
                </View>
              ) : null}

              <View style={styles.divider} />

              <View style={styles.stop}>
                <View style={styles.stopRail}>
                  <View style={[styles.stopDot, { borderColor: COLORS.success }]} />
                  <View style={styles.stopLine} />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.stopLabel}>{t('map.pickup')}</Text>
                  <Text style={styles.stopAddr} numberOfLines={1}>{order.pickup.address}</Text>
                </View>
              </View>
              <View style={styles.stop}>
                <View style={styles.stopRail}>
                  <View style={[styles.stopDot, { borderColor: COLORS.primary }]} />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.stopLabel}>{t('map.delivery')}</Text>
                  <Text style={styles.stopAddr} numberOfLines={1}>{order.delivery.address}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* What next */}
          <View style={styles.info}>
            <View style={styles.infoRow}>
              <CheckIcon color={COLORS.success} />
              <Text style={styles.infoText}>{t('cancel.noCharge')}</Text>
            </View>
            <View style={styles.infoRow}>
              <CheckIcon color={COLORS.success} />
              <Text style={styles.infoText}>{t('cancel.available')}</Text>
            </View>
          </View>

          <Button title={t('active.goDashboard')} onPress={onClose} size="lg" style={styles.btn} />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 20,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 16 },

  header:     { flexDirection: 'row', alignItems: 'center' },
  iconWrap:   { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  iconRing:   { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.error },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title:      { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  subtitle:   { fontSize: 13, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },

  liveChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: COLORS.error + '12', borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8,
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.error, marginRight: 5 },
  liveText: { fontSize: 10, fontWeight: '800', color: COLORS.error, letterSpacing: 0.8 },

  message: { fontSize: 14, color: COLORS.textMuted, lineHeight: 21, marginTop: 14 },

  card: {
    backgroundColor: COLORS.background, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 16,
  },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  rowLabel:     { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  rowValue:     { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  rowValueWrap: { flex: 1, textAlign: 'right', marginLeft: 16 },
  divider:      { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },

  stop:     { flexDirection: 'row' },
  stopRail: { width: 18, alignItems: 'center' },
  stopDot:  { width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, backgroundColor: COLORS.surface, marginTop: 4 },
  stopLine: { flex: 1, width: 1.5, backgroundColor: COLORS.border, marginVertical: 3, minHeight: 14 },
  stopBody: { flex: 1, marginLeft: 8, paddingBottom: 8 },
  stopLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stopAddr:  { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', marginTop: 1, textDecorationLine: 'line-through' },

  info: {
    backgroundColor: COLORS.success + '10', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, gap: 8,
  },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '600' },

  btn: { marginTop: 18 },
});

export default OrderCancelledOverlay;
