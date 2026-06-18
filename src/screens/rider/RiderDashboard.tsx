import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Switch, Alert, ActivityIndicator,
  StatusBar, Modal, Vibration, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { RiderStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { ELEVATION, glow } from '../../constants/theme';
import { fetchRoute } from '../../services/routeService';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import useAppSelector from '../../hooks/useAppSelector';
import {
  setOnlineStatus, setPendingRequests,
  addPendingRequest, removePendingRequest,
} from '../../store/slices/riderSlice';
import { setActiveOrder } from '../../store/slices/orderSlice';
import { getPendingOrders, acceptOrder } from '../../services/orderService';
import { connectSocket, getSocket } from '../../services/socketService';
import { requestLocationPermission, getDistanceKm } from '../../services/locationService';
import { getSavedRingtoneId } from '../../services/ringtoneService';
import { getRingtoneById, DEFAULT_RINGTONE_ID } from '../../constants/ringtones';
import apiClient from '../../services/apiClient';
import Button from '../../components/common/Button';
import { Order, Coordinates } from '../../types';
import { formatCurrency, formatDistance, truncateAddress } from '../../utils/formatters';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

const RiderDashboard = () => {
  const dispatch   = useAppDispatch();
  const profile    = useAppSelector(s => s.auth.profile);
  const isOnline   = useAppSelector(s => s.rider.isOnline);
  const requests   = useAppSelector(s => s.rider.pendingRequests);
  const navigation = useNavigation<NativeStackNavigationProp<RiderStackParamList>>();

  const [togglingOnline, setTogglingOnline] = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [accepting,      setAccepting]      = useState<string | null>(null);
  const [riderPos,       setRiderPos]       = useState<Coordinates | null>(null);

  // New order ring modal
  const [ringOrder,      setRingOrder]      = useState<Order | null>(null);
  const [routeDistance,  setRouteDistance]  = useState<number | null>(null);
  const [routeDuration,  setRouteDuration]  = useState<number | null>(null);
  // OSRM route polylines for the ring-modal mini map (Directions API is disabled)
  const [ringRiderRoute,  setRingRiderRoute]  = useState<{ latitude: number; longitude: number }[]>([]);
  const [ringParcelRoute, setRingParcelRoute] = useState<{ latitude: number; longitude: number }[]>([]);

  const ringAnim       = useRef(new Animated.Value(1)).current;
  const locationWatchId = useRef<number | null>(null);
  const ringSound       = useRef<Sound | null>(null);
  const ringLoaded      = useRef(false);
  const ringFile        = useRef<string>(getRingtoneById(DEFAULT_RINGTONE_ID).file);
  const ringId          = useRef<string | null>(null);

  // (Re)load a ringtone file into the preloaded player, releasing the previous one.
  const loadRingtone = useCallback((file: string) => {
    ringSound.current?.stop();
    ringSound.current?.release();
    ringSound.current  = null;
    ringLoaded.current = false;
    ringFile.current   = file;
    const s = new Sound(file, Sound.MAIN_BUNDLE, err => {
      if (err) {
        console.warn('[RING] sound load failed:', JSON.stringify(err));
        return;
      }
      s.setNumberOfLoops(-1); // loop until rider accepts/declines
      s.setVolume(1.0);
      ringLoaded.current = true;
      ringSound.current  = s;
    });
  }, []);

  // Pick up the rider's chosen ringtone — re-checks on focus so a change made
  // in the profile screen takes effect when they return to the dashboard.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getSavedRingtoneId().then(id => {
        if (!active) return;
        if (ringId.current === id && ringSound.current) return; // already loaded
        ringId.current = id;
        loadRingtone(getRingtoneById(id).file);
      });
      return () => { active = false; };
    }, [loadRingtone]),
  );

  // Release the player when the dashboard unmounts for good.
  useEffect(() => () => {
    ringSound.current?.stop();
    ringSound.current?.release();
    ringSound.current = null;
    ringLoaded.current = false;
  }, []);

  const playRing = () => {
    const s = ringSound.current;
    if (s && ringLoaded.current) {
      s.stop(() => s.play(ok => { if (!ok) console.warn('[RING] playback failed'); }));
      return;
    }
    // Fallback: preloaded instance not ready — load a fresh one and play on load
    console.warn('[RING] preloaded sound not ready, loading on demand');
    const fresh = new Sound(ringFile.current, Sound.MAIN_BUNDLE, err => {
      if (err) { console.warn('[RING] on-demand load failed:', JSON.stringify(err)); return; }
      fresh.setNumberOfLoops(-1);
      fresh.setVolume(1.0);
      ringSound.current  = fresh;
      ringLoaded.current = true;
      fresh.play(ok => { if (!ok) console.warn('[RING] on-demand playback failed'); });
    });
  };
  const stopRing = () => { ringSound.current?.stop(); };

  // Pulse animation for ring modal
  useEffect(() => {
    if (!ringOrder) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [ringOrder]);

  // Fetch road routes for the ring-modal mini map via OSRM (Google Directions is
  // disabled on the key — see reference-google-maps-apis). Draws rider→pickup
  // (green) + pickup→delivery (red) as Polylines, with straight-line fallback,
  // and derives the distance/ETA chips from the rider→pickup leg.
  useEffect(() => {
    if (!ringOrder) { setRingRiderRoute([]); setRingParcelRoute([]); return; }
    const pickup   = ringOrder.pickup.coordinates;
    const delivery = ringOrder.delivery.coordinates;
    const straight = (a: Coordinates, b: Coordinates) => [
      { latitude: a.lat, longitude: a.lng },
      { latitude: b.lat, longitude: b.lng },
    ];
    let cancelled = false;
    (async () => {
      if (pickup && delivery) {
        const r = await fetchRoute(pickup, delivery);
        if (!cancelled) setRingParcelRoute(r?.coords?.length ? r.coords : straight(pickup, delivery));
      }
      if (riderPos && pickup) {
        const r = await fetchRoute(riderPos, pickup);
        if (!cancelled) {
          setRingRiderRoute(r?.coords?.length ? r.coords : straight(riderPos, pickup));
          if (r) { setRouteDistance(r.distance / 1000); setRouteDuration(r.duration / 60); }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ringOrder?._id, riderPos]);

  // Start GPS when online
  useEffect(() => {
    if (!isOnline) {
      if (locationWatchId.current !== null) {
        Geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
      return;
    }
    requestLocationPermission().then(status => {
      if (status !== 'granted') return;
      locationWatchId.current = Geolocation.watchPosition(
        pos => setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, distanceFilter: 30, interval: 6000, fastestInterval: 4000 },
      );
    });
    return () => {
      if (locationWatchId.current !== null) {
        Geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
    };
  }, [isOnline]);

  const loadPending = useCallback(async () => {
    setRefreshing(true);
    try { dispatch(setPendingRequests(await getPendingOrders())); } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    let mounted = true;
    connectSocket().then(socket => {
      socket.on('new_order_request', (order: Order) => {
        if (!mounted || !isOnline) return;
        dispatch(addPendingRequest(order));
        // Ring the rider!
        Vibration.vibrate([300, 200, 300, 200, 500]);
        playRing();
        setRingOrder(order);
        setRouteDistance(null);
        setRouteDuration(null);
      });
    });
    return () => {
      mounted = false;
      getSocket()?.off('new_order_request');
    };
  }, [isOnline]);

  useEffect(() => { if (isOnline) loadPending(); }, [isOnline]);

  const toggleOnline = async (value: boolean) => {
    try {
      setTogglingOnline(true);
      await apiClient.put('/rider/status', { isOnline: value });
      dispatch(setOnlineStatus(value));
      if (value) loadPending();
      else dispatch(setPendingRequests([]));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setTogglingOnline(false);
    }
  };

  const handleAccept = async (order: Order) => {
    stopRing();
    try {
      setAccepting(order._id);
      const accepted = await acceptOrder(order._id);
      dispatch(setActiveOrder(accepted));
      dispatch(removePendingRequest(order._id));
      setRingOrder(null);
      navigation.navigate('ActiveDelivery', { orderId: accepted._id });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAccepting(null);
    }
  };

  const handleDecline = (orderId: string) => {
    stopRing();
    dispatch(removePendingRequest(orderId));
    if (ringOrder?._id === orderId) setRingOrder(null);
  };

  const distanceToPickup = (order: Order): string | null => {
    if (!riderPos) return null;
    const km = getDistanceKm(riderPos, order.pickup.coordinates);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  };

  const firstName = profile?.name?.split(' ')[0] || 'Rider';

  const renderRequest = ({ item }: { item: Order }) => {
    const dist = distanceToPickup(item);
    return (
      <View style={styles.requestCard}>
        <View style={styles.cardTop}>
          <Text style={styles.orderId}># {item.orderId}</Text>
          <View style={styles.earningPill}>
            <Text style={styles.earningPillText}>+{formatCurrency(item.riderEarning || 0)}</Text>
          </View>
        </View>

        <View style={styles.routeBlock}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(item.pickup.address)}</Text>
          </View>
          <View style={styles.routeConnector} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(item.delivery.address)}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>📦 {formatDistance(item.fare?.distance || 0)}</Text>
          </View>
          {dist && (
            <View style={[styles.metaPill, { backgroundColor: COLORS.warningBg }]}>
              <Text style={[styles.metaPillText, { color: COLORS.warning }]}>📍 {dist} door</Text>
            </View>
          )}
          <Text style={styles.customerFare}>{formatCurrency(item.fare?.estimated || 0)}</Text>
        </View>

        <View style={styles.btnRow}>
          <Button title="Accept" onPress={() => handleAccept(item)} loading={accepting === item._id} style={{ flex: 1 }} />
          <Button title="Decline" onPress={() => handleDecline(item._id)} variant="ghost" style={{ flex: 1 }} />
        </View>
      </View>
    );
  };

  const ringPickupLatLng = ringOrder?.pickup.coordinates
    ? { latitude: ringOrder.pickup.coordinates.lat, longitude: ringOrder.pickup.coordinates.lng }
    : null;
  const ringDeliveryLatLng = ringOrder?.delivery.coordinates
    ? { latitude: ringOrder.delivery.coordinates.lat, longitude: ringOrder.delivery.coordinates.lng }
    : null;
  const riderLatLng = riderPos ? { latitude: riderPos.lat, longitude: riderPos.lng } : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar backgroundColor={COLORS.secondary} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hey, {firstName} 👋</Text>
          <Text style={styles.subGreeting}>Ready to deliver today?</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
        </View>
      </View>

      {/* Online Toggle */}
      <View style={[styles.onlineCard, isOnline ? styles.onlineCardActive : styles.onlineCardInactive]}>
        <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.online : COLORS.offline }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.onlineLabel}>{isOnline ? 'You are Online' : 'You are Offline'}</Text>
          <Text style={styles.onlineSub}>{isOnline ? 'Receiving delivery requests' : 'Go online to earn money'}</Text>
        </View>
        {togglingOnline
          ? <ActivityIndicator color={COLORS.secondary} size="small" />
          : <Switch value={isOnline} onValueChange={toggleOnline} thumbColor="#fff" trackColor={{ true: COLORS.online, false: COLORS.border }} />
        }
      </View>

      {isOnline ? (
        <FlatList
          data={requests}
          keyExtractor={o => o._id}
          renderItem={renderRequest}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadPending} colors={[COLORS.secondary]} />}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderText}>New Requests</Text>
                <View style={styles.countPill}><Text style={styles.countText}>{requests.length}</Text></View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Orders ka wait kar rahe hain…</Text>
              <Text style={styles.emptySub}>New delivery request aate hi yahan dikhengi</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.offlineWrap}>
          <View style={styles.offlineIconBox}><Text style={styles.offlineIcon}>😴</Text></View>
          <Text style={styles.offlineTitle}>You're Offline</Text>
          <Text style={styles.offlineSub}>Switch on karo aur delivery requests lena shuru karo</Text>
        </View>
      )}

      {/* ─── New Order Ring Modal ─── */}
      <Modal visible={!!ringOrder} transparent animationType="slide" onRequestClose={() => { stopRing(); setRingOrder(null); }}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { transform: [{ scale: ringAnim }] }]}>

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalRingIcon}>🔔</Text>
              <Text style={styles.modalTitle}>Naya Order!</Text>
              <Text style={styles.modalSub}># {ringOrder?.orderId}</Text>
            </View>

            {/* Mini Map */}
            {ringPickupLatLng && ringDeliveryLatLng && (
              <View style={styles.modalMapBox}>
                <MapView
                  style={styles.modalMap}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude:  (ringPickupLatLng.latitude + ringDeliveryLatLng.latitude) / 2,
                    longitude: (ringPickupLatLng.longitude + ringDeliveryLatLng.longitude) / 2,
                    latitudeDelta:  Math.abs(ringPickupLatLng.latitude  - ringDeliveryLatLng.latitude)  * 2.5 + 0.05,
                    longitudeDelta: Math.abs(ringPickupLatLng.longitude - ringDeliveryLatLng.longitude) * 2.5 + 0.05,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}>

                  {/* Rider → Pickup route (green, OSRM) */}
                  {riderLatLng && ringRiderRoute.length > 0 && (
                    <Polyline
                      coordinates={ringRiderRoute}
                      strokeWidth={3}
                      strokeColor={COLORS.success}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}

                  {/* Pickup → Delivery route (red, OSRM) */}
                  {ringParcelRoute.length > 0 && (
                    <Polyline
                      coordinates={ringParcelRoute}
                      strokeWidth={3}
                      strokeColor={COLORS.primary}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}

                  {riderLatLng && <Marker coordinate={riderLatLng} title="Aap"><View style={styles.riderDot} /></Marker>}
                  <Marker coordinate={ringPickupLatLng} title="Pickup" pinColor="green" />
                  <Marker coordinate={ringDeliveryLatLng} title="Delivery" pinColor={COLORS.primary} />
                </MapView>

                {/* Route chips on map */}
                <View style={styles.mapChips}>
                  {routeDistance !== null && (
                    <View style={styles.mapChip}>
                      <Text style={styles.mapChipTxt}>📍 {routeDistance.toFixed(1)} km door</Text>
                    </View>
                  )}
                  {routeDuration !== null && (
                    <View style={[styles.mapChip, { backgroundColor: COLORS.warningBg }]}>
                      <Text style={[styles.mapChipTxt, { color: COLORS.warning }]}>
                        🕐 {Math.round(routeDuration)} min
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Order Details */}
            {ringOrder && (
              <View style={styles.modalDetails}>
                <View style={styles.routeBlock}>
                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.routeText} numberOfLines={2}>{ringOrder.pickup.address}</Text>
                  </View>
                  <View style={styles.routeConnector} />
                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                    <Text style={styles.routeText} numberOfLines={2}>{ringOrder.delivery.address}</Text>
                  </View>
                </View>

                <View style={styles.modalMetaRow}>
                  <View style={styles.modalMetaBox}>
                    <Text style={styles.modalMetaLabel}>Earning</Text>
                    <Text style={styles.modalMetaValue}>{formatCurrency(ringOrder.riderEarning || 0)}</Text>
                  </View>
                  <View style={styles.modalMetaBox}>
                    <Text style={styles.modalMetaLabel}>Parcel Dist.</Text>
                    <Text style={styles.modalMetaValue}>{formatDistance(ringOrder.fare?.distance || 0)}</Text>
                  </View>
                  <View style={styles.modalMetaBox}>
                    <Text style={styles.modalMetaLabel}>Customer</Text>
                    <Text style={styles.modalMetaValue}>{formatCurrency(ringOrder.fare?.estimated || 0)}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            {ringOrder && (
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => handleDecline(ringOrder._id)}
                  activeOpacity={0.8}>
                  <Text style={styles.declineBtnText}>✕ Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => handleAccept(ringOrder)}
                  activeOpacity={0.85}>
                  {accepting === ringOrder._id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.acceptBtnText}>✓ Accept Order</Text>}
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 24,
    borderBottomLeftRadius: 26, borderBottomRightRadius: 26,
    ...glow(COLORS.secondary, 0.25),
  },
  headerLeft:  { flex: 1 },
  greeting:    { fontSize: 22, fontWeight: '800', color: '#fff' },
  subGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  onlineCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, borderRadius: 18, padding: 16, borderWidth: 2,
    ...ELEVATION.card,
  },
  onlineCardActive:   { backgroundColor: '#F0FDF4', borderColor: COLORS.online },
  onlineCardInactive: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  statusDot:   { width: 10, height: 10, borderRadius: 5 },
  onlineLabel: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  onlineSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  list:    { paddingHorizontal: 16, paddingBottom: 32 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  listHeaderText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  countPill: { backgroundColor: COLORS.secondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  requestCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: COLORS.secondary + '40',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderId: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  earningPill: { backgroundColor: COLORS.successBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  earningPillText: { fontSize: 14, fontWeight: '800', color: COLORS.success },

  routeBlock:    { marginBottom: 12 },
  routeRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:      { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  routeConnector:{ width: 1, height: 12, backgroundColor: COLORS.border, marginLeft: 3.5, marginVertical: 3 },
  routeText:     { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  metaPill: { backgroundColor: COLORS.secondaryBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  metaPillText: { fontSize: 12, fontWeight: '700', color: COLORS.secondary },
  customerFare: { fontSize: 12, color: COLORS.textMuted, marginLeft: 'auto' },

  btnRow: { flexDirection: 'row', gap: 10 },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  offlineWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  offlineIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  offlineIcon:  { fontSize: 48 },
  offlineTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  offlineSub:   { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 16,
  },
  modalHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  modalRingIcon: { fontSize: 36, marginBottom: 6 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  modalSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  modalMapBox: { height: 190, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', marginBottom: 14, position: 'relative' },
  modalMap: { flex: 1 },
  mapChips: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', gap: 6 },
  mapChip: { backgroundColor: COLORS.primaryBg, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.primary + '40' },
  mapChipTxt: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  riderDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.secondary, borderWidth: 2, borderColor: '#fff' },

  modalDetails: { paddingHorizontal: 16, marginBottom: 12 },
  modalMetaRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalMetaBox: {
    flex: 1, backgroundColor: COLORS.surface2, borderRadius: 12, padding: 12, alignItems: 'center',
  },
  modalMetaLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  modalMetaValue: { fontSize: 15, fontWeight: '800', color: COLORS.text },

  modalBtnRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  declineBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  acceptBtn: {
    flex: 2, paddingVertical: 15, borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

export default RiderDashboard;
