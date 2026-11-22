import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Switch, Alert,
  Platform, Pressable, PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookingDraft, CustomerStackParamList, CustomerTabParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { RADIUS, glow } from '../../constants/theme';
import { ParcelSize, LocationInfo, ParcelInfo, Coordinates, PaymentMethod } from '../../types';
import Input          from '../../components/common/Input';
import Button         from '../../components/common/Button';
import Card           from '../../components/common/Card';
import ScreenHeader   from '../../components/navigation/ScreenHeader';
import AddressSearchInput from '../../components/common/AddressSearchInput';
import { TranslationKey, useTranslation } from '../../i18n';
import { estimateFare }   from '../../services/orderService';
import { getQuickPosition } from '../../services/locationService';
import { selectContactPhone } from 'react-native-select-contact';
import { KeyboardAwareScrollView } from '../../components/common/KeyboardAware';

// Pickup + delivery points. points[0] = pickup, baaki = drops (aakhri = final drop,
// beech wale = stops). Max 3 beech ke stops — backend bhi yahi limit rakhta hai.
const MAX_STOPS = 3;
interface RoutePoint {
  id: number;          // React key — swap me content badalta hai, id nahi
  address: string;
  coords: Coordinates | null;
  contact: string;
  phone: string;
  vkey: number;        // AddressSearchInput ko bahar se naya address dene ka signal
}
let pointSeq = 1;
const newPoint = (p?: Partial<LocationInfo>): RoutePoint => ({
  id: pointSeq++,
  address: p?.address ?? '',
  coords: p?.coordinates ?? null,
  contact: p?.contactName ?? '',
  phone: p?.contactPhone ?? '',
  vkey: 0,
});
const toLocation = (p: RoutePoint): LocationInfo => ({
  address: p.address, coordinates: p.coords as Coordinates, contactName: p.contact, contactPhone: p.phone,
});

// Do points ke beech ↑↓ button — tap karte hi dono pate (contact samet) aapas me badal jaate hain
const SwapButton: React.FC<{ onPress: () => void; label: string }> = ({ onPress, label }) => (
  <View style={styles.swapRow} pointerEvents="box-none">
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.swapBtn, pressed && styles.swapBtnPressed]}>
      <Text style={styles.swapArrowUp}>↑</Text>
      <Text style={styles.swapArrowDown}>↓</Text>
    </Pressable>
  </View>
);

const SIZES: { value: ParcelSize; label: TranslationKey; desc: TranslationKey; icon: string }[] = [
  { value: 'small',  label: 'book.small',  icon: '📄', desc: 'book.smallDesc' },
  { value: 'medium', label: 'book.medium', icon: '👟', desc: 'book.mediumDesc' },
  { value: 'large',  label: 'book.large',  icon: '📦', desc: 'book.largeDesc' },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: TranslationKey; desc: TranslationKey; icon: string }[] = [
  { value: 'COD',    label: 'pay.cod',    desc: 'pay.codDesc',    icon: '💵' },
  { value: 'ONLINE', label: 'pay.online', desc: 'pay.onlineDesc', icon: '💳' },
];

const WEIGHT_PRESETS = [0.5, 1, 2, 5, 10];

// Premium section header: colored icon chip + title + Hinglish hint.
const SectionHead: React.FC<{ icon: string; color: string; title: string; sub: string; step: number; onRemove?: () => void; removeLabel?: string }> =
  ({ icon, color, title, sub, step, onRemove, removeLabel }) => (
  <View style={styles.sectionHead}>
    <View style={[styles.sectionChip, { backgroundColor: color + '1A', borderColor: color + '33' }]}>
      <Text style={styles.sectionChipIcon}>{icon}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{sub}</Text>
    </View>
    {onRemove ? (
      <Pressable onPress={onRemove} hitSlop={8} style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button" accessibilityLabel={removeLabel}>
        <Text style={styles.removeBtnText}>✕ {removeLabel}</Text>
      </Pressable>
    ) : null}
    <View style={[styles.stepBadge, { backgroundColor: color }]}>
      <Text style={styles.stepBadgeText}>{step}</Text>
    </View>
  </View>
);

const BookParcelScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { t }      = useTranslation();

  // Coords sirf map pin-confirm ke baad set hote hain — koi default nahi,
  // warna galat (purani/Delhi) location par order chala jaata hai.
  const [points, setPoints] = useState<RoutePoint[]>(() => [newPoint(), newPoint()]);
  const pickupCoords = points[0].coords;
  const setPoint = (i: number, patch: Partial<RoutePoint>) =>
    setPoints(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // ↑↓ — do padosi points ka poora content (address, pin, contact) badlo
  const swapPoints = (i: number) => setPoints(ps => {
    const next = [...ps];
    const a = next[i], b = next[i + 1];
    next[i]     = { ...a, address: b.address, coords: b.coords, contact: b.contact, phone: b.phone, vkey: a.vkey + 1 };
    next[i + 1] = { ...b, address: a.address, coords: a.coords, contact: a.contact, phone: a.phone, vkey: b.vkey + 1 };
    return next;
  });
  const addStop = () => setPoints(ps => (ps.length - 2 < MAX_STOPS ? [...ps, newPoint()] : ps));
  const removePoint = (i: number) => setPoints(ps => (ps.length > 2 ? ps.filter((_, j) => j !== i) : ps));

  // Search suggestions ko user ke area ki taraf bias karne ke liye (silent,
  // koi permission prompt nahi).
  const [searchBias, setSearchBias] = useState<Coordinates | null>(null);
  useEffect(() => {
    getQuickPosition().then(setSearchBias).catch(() => {});
  }, []);

  const [description,      setDescription]      = useState('');
  const [weight,           setWeight]           = useState('1');
  const [size,             setSize]             = useState<ParcelSize>('small');
  const [isFragile,        setIsFragile]        = useState(false);
  const [paymentMethod,    setPaymentMethod]    = useState<PaymentMethod>('COD');
  const [loading,          setLoading]          = useState(false);

  const handleSelect = (i: number) => (address: string, coords: Coordinates) => setPoint(i, { address, coords });

  // User ne address text badla (naya search) — purane coords ab galat hain.
  // Dobara pin-confirm hone tak estimate aage nahi badhega. Same text (jaise
  // paste) par confirmed pin mat udao — sirf sach me badla ho tab invalidate.
  const handleTextChange = (i: number) => (text: string) => {
    setPoints(ps => ps.map((p, j) => (j === i && text !== p.address ? { ...p, coords: null } : p)));
  };

  // "Order again" — purane order ki details form me bharo (nonce se, taaki dobara bhi chale)
  const route = useRoute<RouteProp<CustomerTabParamList, 'BookParcel'>>();
  const scrollRef = useRef<React.ElementRef<typeof KeyboardAwareScrollView>>(null);
  const appliedNonce = useRef<number | null>(null);
  const [reorderOf, setReorderOf] = useState<string | null>(null);
  useEffect(() => {
    const p = route.params;
    if (!p?.draft || appliedNonce.current === p.nonce) return;
    appliedNonce.current = p.nonce;
    const d: BookingDraft = p.draft;
    setPoints(prev => {
      const next = [d.pickup, ...d.drops].map(newPoint);
      // vkey purane se alag rakho — AddressSearchInput naya address zaroor le
      const bump = Math.max(0, ...prev.map(x => x.vkey)) + 1;
      return next.map(x => ({ ...x, vkey: bump }));
    });
    setDescription(d.parcel.description && d.parcel.description !== 'Parcel' ? d.parcel.description : '');
    setWeight(String(d.parcel.weight || 1));
    setSize(d.parcel.size || 'small');
    setIsFragile(!!d.parcel.isFragile);
    setPaymentMethod(d.paymentMethod || 'COD');
    setReorderOf(d.sourceOrderId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [route.params]);

  // Phone contacts se number uthao (manual entry ka option waise hi rehta hai).
  // selectedPhone.number set karo; agar naam khaali hai to contact ka naam bhi bhar do.
  const pickContact = async (
    setPhone: (v: string) => void,
    nameValue: string,
    setName: (v: string) => void,
  ) => {
    try {
      // Android 6+ par contacts padhne ke liye runtime permission chahiye.
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: t('book.contactsPermTitle'),
            message: t('book.contactsPermMsg'),
            buttonPositive: t('common.allow'),
            buttonNegative: t('common.cancel'),
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(t('common.permission'), t('book.contactsDenied'));
          return;
        }
      }
      const selection = await selectContactPhone();
      if (!selection) return; // user ne cancel kiya
      const number = (selection.selectedPhone.number || '').replace(/[^0-9+]/g, '');
      if (number) setPhone(number);
      if (!nameValue.trim() && selection.contact.name) setName(selection.contact.name);
    } catch (e: any) {
      console.log('[CONTACT] picker error:', e?.message || String(e), JSON.stringify(e));
      Alert.alert(t('book.contacts'), t('book.contactsFailed'));
    }
  };

  const handleEstimate = async () => {
    const [pickupPoint, ...drops] = points;
    if (!pickupPoint.address.trim() || !pickupPoint.coords) {
      return Alert.alert(
        t('book.setPickup'),
        t('book.setPickupMsg'),
      );
    }
    for (let i = 0; i < drops.length; i++) {
      if (drops[i].address.trim() && drops[i].coords) continue;
      const isFinal = i === drops.length - 1;
      return isFinal
        ? Alert.alert(t('book.setDelivery'), t('book.setDeliveryMsg'))
        : Alert.alert(t('book.setStop', { n: i + 1 }), t('book.setStopMsg', { n: i + 1 }));
    }
    try {
      setLoading(true);
      const parcel: ParcelInfo = {
        description: description || 'Parcel',
        weight: parseFloat(weight) || 1,
        size,
        isFragile,
      };
      const pickup = toLocation(pickupPoint);
      const delivery = toLocation(drops[drops.length - 1]);
      const stops = drops.slice(0, -1).map(toLocation);
      const estimate = await estimateFare({
        pickup: pickup.coordinates, delivery: delivery.coordinates, stops: stops.map(s => s.coordinates), parcel,
      });
      navigation.navigate('FareEstimate', { pickup, delivery, stops, parcel, estimate, paymentMethod });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader title={t('book.title')} subtitle={t('book.subtitle')} />
      {/* Address/parcel box par focus hote hi wo keyboard ke upar aa jaata hai */}
      <View style={styles.flex}>
        <KeyboardAwareScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          extraOffset={32}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled>

          {reorderOf && (
            <View style={styles.reorderBanner}>
              <Text style={styles.reorderIcon}>🔁</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.reorderTitle}>{t('book.reorderTitle', { id: reorderOf })}</Text>
                <Text style={styles.reorderSub}>{t('book.reorderSub')}</Text>
              </View>
              <Pressable onPress={() => setReorderOf(null)} hitSlop={10} accessibilityLabel="Dismiss">
                <Text style={styles.reorderClose}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Pickup + drops — beech me ↑↓ se upar-neeche, "Add stop" se aur drop point */}
          {points.map((p, i) => {
            const isPickup = i === 0;
            const dropCount = points.length - 1;
            const isFinal = i === points.length - 1;
            const color = isPickup ? COLORS.success : isFinal ? COLORS.primary : COLORS.warning;
            const icon = isPickup ? '📍' : isFinal ? '🏁' : '📌';
            const title = isPickup ? t('book.pickupLocation')
              : dropCount === 1 ? t('book.deliveryLocation')
              : isFinal ? t('book.finalDrop') : t('book.stopN', { n: i });
            const sub = isPickup ? t('book.pickupSub')
              : dropCount === 1 ? t('book.deliverySub')
              : isFinal ? t('book.finalDropSub') : t('book.stopSub');
            return (
              <React.Fragment key={p.id}>
                {i > 0 && <SwapButton onPress={() => swapPoints(i - 1)} label={t('book.swapPoints')} />}
                <View style={[styles.sectionBlock, { zIndex: 40 - i }]}>
                  <SectionHead icon={icon} color={color} title={title} sub={sub} step={i + 1}
                    onRemove={!isPickup && dropCount > 1 ? () => removePoint(i) : undefined}
                    removeLabel={t('book.removeStop')} />
                  <Card style={{ zIndex: 40 - i, overflow: 'visible' }}>
                    <AddressSearchInput
                      label={t('book.address')}
                      placeholder={isPickup ? t('book.searchPickup') : t('book.searchDelivery')}
                      leftIcon={icon}
                      showCurrentLocation={isPickup}
                      biasCoords={isPickup ? searchBias : (pickupCoords || searchBias)}
                      onSelect={handleSelect(i)}
                      onTextChange={handleTextChange(i)}
                      value={p.coords ? { address: p.address, coords: p.coords } : null}
                      valueKey={p.vkey || undefined}
                    />
                    <Input
                      label={t('book.contactName')}
                      value={p.contact}
                      onChangeText={v => setPoint(i, { contact: v })}
                      placeholder={isPickup ? t('book.senderName') : t('book.receiverName')}
                      leftIcon="👤"
                    />
                    <Input
                      label={t('book.contactPhone')}
                      value={p.phone}
                      onChangeText={v => setPoint(i, { phone: v })}
                      placeholder={isPickup ? t('book.senderPhone') : t('book.receiverPhone')}
                      keyboardType="phone-pad"
                      leftIcon="📞"
                      rightIcon="👥"
                      onRightIconPress={() => pickContact(v => setPoint(i, { phone: v }), p.contact, v => setPoint(i, { contact: v }))}
                    />
                  </Card>
                </View>
              </React.Fragment>
            );
          })}

          {points.length - 2 < MAX_STOPS && (
            <Pressable
              onPress={addStop}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addStopBtn, pressed && styles.addStopBtnPressed]}>
              <View style={styles.addStopIcon}><Text style={styles.addStopIconText}>＋</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addStopTitle}>{t('book.addStop')}</Text>
                <Text style={styles.addStopSub}>{t('book.addStopSub', { n: MAX_STOPS - (points.length - 2) })}</Text>
              </View>
            </Pressable>
          )}

          {/* Parcel Info */}
          <View style={styles.sectionBlock}>
            <SectionHead icon="📦" color={COLORS.warning} title={t('book.parcelDetails')} sub={t('book.parcelSub')} step={points.length + 1} />
            <Card>
              <Input
                label={t('book.descOptional')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('book.descPh')}
                leftIcon="📝"
              />
              <Input
                label={t('book.weight')}
                value={weight}
                onChangeText={setWeight}
                placeholder="1.0"
                keyboardType="decimal-pad"
                leftIcon="⚖️"
              />
              <View style={styles.weightChips}>
                {WEIGHT_PRESETS.map(v => {
                  const active = parseFloat(weight) === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setWeight(String(v))}
                      style={({ pressed }) => [
                        styles.weightChip,
                        active && styles.weightChipActive,
                        pressed && { opacity: 0.85 },
                      ]}>
                      <Text style={[styles.weightChipText, active && styles.weightChipTextActive]}>
                        {v} kg
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>{t('book.parcelSize')}</Text>
              <View style={styles.sizeGrid}>
                {SIZES.map(s => {
                  const active = size === s.value;
                  return (
                    <Pressable
                      key={s.value}
                      style={({ pressed }) => [
                        styles.sizeCard,
                        active && styles.sizeCardActive,
                        pressed && { transform: [{ scale: 0.97 }] },
                      ]}
                      onPress={() => setSize(s.value)}>
                      {active && (
                        <View style={styles.sizeCheck}>
                          <Text style={styles.sizeCheckText}>✓</Text>
                        </View>
                      )}
                      <Text style={styles.sizeIcon}>{s.icon}</Text>
                      <Text style={[styles.sizeLabel, active && styles.sizeLabelActive]}>
                        {t(s.label)}
                      </Text>
                      <Text style={styles.sizeDesc} numberOfLines={2}>{t(s.desc)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.switchRow, isFragile && styles.switchRowActive]}>
                <Text style={styles.switchIcon}>🛡️</Text>
                <View style={styles.switchLeft}>
                  <Text style={styles.switchLabel}>{t('book.fragile')}</Text>
                  <Text style={styles.switchSub}>{t('book.fragileSub')}</Text>
                </View>
                <Switch
                  value={isFragile}
                  onValueChange={setIsFragile}
                  thumbColor="#fff"
                  trackColor={{ true: COLORS.primary, false: COLORS.border }}
                />
              </View>
            </Card>
          </View>

          {/* Payment Method */}
          <View style={styles.sectionBlock}>
            <SectionHead icon="💳" color={COLORS.secondary} title={t('book.paymentMethod')} sub={t('book.paymentSub')} step={points.length + 2} />
            <View style={styles.paymentGrid}>
              {PAYMENT_METHODS.map(pm => {
                const active = paymentMethod === pm.value;
                return (
                  <Pressable
                    key={pm.value}
                    style={({ pressed }) => [
                      styles.paymentCard,
                      active && styles.paymentCardActive,
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                    onPress={() => setPaymentMethod(pm.value)}>
                    {active && (
                      <View style={styles.sizeCheck}>
                        <Text style={styles.sizeCheckText}>✓</Text>
                      </View>
                    )}
                    <Text style={styles.sizeIcon}>{pm.icon}</Text>
                    <Text style={[styles.sizeLabel, active && styles.sizeLabelActive]}>{t(pm.label)}</Text>
                    <Text style={styles.sizeDesc} numberOfLines={2}>{t(pm.desc)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button
            title={t('book.getEstimate')}
            onPress={handleEstimate}
            loading={loading}
            icon="→"
            size="lg"
            style={styles.btn}
          />
          <View style={{ height: 12 }} />

        </KeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  sectionBlock: { marginBottom: 4 },

  // ↑↓ swap — do cards ke beech, right side par card ke kinare par baitha gol button
  swapRow: { height: 0, alignItems: 'flex-end', paddingRight: 18, zIndex: 60 },
  swapBtn: {
    width: 46, height: 46, borderRadius: 23, marginTop: -6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 5,
  },
  swapBtnPressed: { backgroundColor: COLORS.primaryBg, transform: [{ scale: 0.94 }] },
  swapArrowUp:   { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: -8, marginRight: -1 },
  swapArrowDown: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 8, marginLeft: -1 },

  removeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.error + '14' },
  removeBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.error },

  addStopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.primary + '80',
    backgroundColor: COLORS.primaryBg,
  },
  addStopBtnPressed: { opacity: 0.75 },
  addStopIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  addStopIconText: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: -1 },
  addStopTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  addStopSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  reorderBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12,
    borderRadius: RADIUS.md, backgroundColor: COLORS.secondaryBg, borderLeftWidth: 3, borderLeftColor: COLORS.secondary,
  },
  reorderIcon: { fontSize: 20 },
  reorderTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  reorderSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },
  reorderClose: { fontSize: 15, color: COLORS.textMuted, paddingHorizontal: 4 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, marginTop: 18 },
  sectionChip: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionChipIcon: { fontSize: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  sectionSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },

  fieldLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.text,
    marginBottom: 12, marginTop: 4,
  },

  weightChips: { flexDirection: 'row', gap: 8, marginTop: -6, marginBottom: 16, flexWrap: 'wrap' },
  weightChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  weightChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  weightChipText:   { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  weightChipTextActive: { color: COLORS.primary },

  sizeGrid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  paymentGrid: { flexDirection: 'row', gap: 10 },
  paymentCard: {
    flex: 1, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border,
    paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', backgroundColor: COLORS.surface,
    position: 'relative',
  },
  paymentCardActive: {
    borderColor: COLORS.secondary, backgroundColor: COLORS.secondaryBg,
    ...glow(COLORS.secondary, 0.18),
  },
  sizeCard: {
    flex: 1, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border,
    paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', backgroundColor: COLORS.surface,
    position: 'relative',
  },
  sizeCardActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg,
    ...glow(COLORS.primary, 0.18),
  },
  sizeCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sizeCheckText:  { fontSize: 11, fontWeight: '900', color: '#fff' },
  sizeIcon:       { fontSize: 26, marginBottom: 6 },
  sizeLabel:      { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  sizeLabelActive:{ color: COLORS.primary },
  sizeDesc:       { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', lineHeight: 13 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  switchRowActive: {
    borderTopColor: 'transparent', backgroundColor: COLORS.primaryBg,
    borderRadius: RADIUS.md, paddingHorizontal: 12, paddingBottom: 12, marginHorizontal: -4,
  },
  switchIcon: { fontSize: 22 },
  switchLeft: { flex: 1 },
  switchLabel:{ fontSize: 14, fontWeight: '700', color: COLORS.text },
  switchSub:  { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  btn: { marginTop: 10 },
});

export default BookParcelScreen;
