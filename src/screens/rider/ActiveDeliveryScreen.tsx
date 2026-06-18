import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TextInput, Animated, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { RiderStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setActiveOrder } from '../../store/slices/orderSlice';
import { connectSocket, joinOrderRoom, emitRiderLocation } from '../../services/socketService';
import { getOrderById, confirmPickup, confirmDelivery } from '../../services/orderService';
import { requestLocationPermission, getCurrentPosition } from '../../services/locationService';
import { fetchRoute } from '../../services/routeService';
import apiClient from '../../services/apiClient';
import Button       from '../../components/common/Button';
import StatusBadge  from '../../components/common/StatusBadge';
import ScreenHeader from '../../components/navigation/ScreenHeader';
import { Order, Coordinates } from '../../types';
import { formatCurrency, truncateAddress } from '../../utils/formatters';

type Route = RouteProp<RiderStackParamList, 'ActiveDelivery'>;

const ActiveDeliveryScreen = () => {
  const route      = useRoute<Route>();
  const navigation = useNavigation();
  const dispatch   = useAppDispatch();
  const { orderId } = route.params;

  const mapRef              = useRef<MapView>(null);
  const bannerAnim          = useRef(new Animated.Value(0)).current;
  const [order,   setOrder]  = useState<Order | null>(null);
  const [otp,     setOtp]    = useState('');
  const [loading, setLoading] = useState(false);
  const [riderPos, setRiderPos] = useState<Coordinates | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [showPickupBanner, setShowPickupBanner] = useState(false);
  const locationWatchId = useRef<number | null>(null);
  const lastRouteOrigin = useRef<Coordinates | null>(null);
  const lastRouteTarget = useRef<Coordinates | null>(null);

  // Animate pickup→delivery transition banner
  const showTransitionBanner = () => {
    setShowPickupBanner(true);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(bannerAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowPickupBanner(false));
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const o = await getOrderById(orderId);
        if (mounted) { setOrder(o); dispatch(setActiveOrder(o)); }
      } catch { /* silent */ }

      const socket = await connectSocket();
      joinOrderRoom(orderId);
      socket.on('order_update', ({ status }: { status: Order['status'] }) => {
        if (mounted) setOrder(prev => prev ? { ...prev, status } : prev);
      });

      // Request location permission before starting GPS
      const permStatus = await requestLocationPermission();
      if (permStatus !== 'granted') {
        Alert.alert('Location Chahiye', 'Delivery ke liye GPS allow karo.');
        return;
      }

      // Get one immediate fix so the rider marker + route line appear right away.
      // watchPosition can take several seconds (or silently fail) for its first
      // callback, which would leave the map without a current location.
      getCurrentPosition()
        .then(c => { if (mounted) setRiderPos(c); })
        .catch(() => { /* watchPosition below may still deliver */ });

      locationWatchId.current = Geolocation.watchPosition(
        pos => {
          const { latitude: lat, longitude: lng, heading } = pos.coords;
          if (mounted) setRiderPos({ lat, lng });
          apiClient.post('/rider/location', { lat, lng, heading: heading || 0 }).catch(() => {});
          emitRiderLocation(orderId, lat, lng, heading || 0);
        },
        err => { console.warn('[ActiveDelivery] watchPosition error', err?.message); },
        { enableHighAccuracy: true, distanceFilter: 15, interval: 4000, fastestInterval: 2000 },
      );
    };
    init();
    return () => {
      mounted = false;
      if (locationWatchId.current !== null) Geolocation.clearWatch(locationWatchId.current);
    };
  }, [orderId]);

  // Center / fit the map on the active target as soon as the order loads
  // and on every pickup → delivery transition. Runs even without GPS or the
  // Directions API (both can be unavailable), so the pickup is always visible.
  useEffect(() => {
    if (!order || !mapRef.current) return;
    const targetCoords = order.status === 'accepted'
      ? order.pickup.coordinates
      : order.delivery.coordinates;
    if (!targetCoords) return;
    if (riderPos) {
      // GPS available — frame both the rider and the target
      mapRef.current.fitToCoordinates([
        { latitude: riderPos.lat, longitude: riderPos.lng },
        { latitude: targetCoords.lat, longitude: targetCoords.lng },
      ], { edgePadding: { top: 70, right: 50, bottom: 50, left: 50 }, animated: true });
    } else {
      // No GPS yet — still center on the target so the pickup pin is on screen
      mapRef.current.animateToRegion({
        latitude:  targetCoords.lat,
        longitude: targetCoords.lng,
        latitudeDelta:  0.02,
        longitudeDelta: 0.02,
      }, 600);
    }
  }, [order?._id, order?.status, riderPos]);

  // Fetch a road-following route (rider → current target) and draw it as a blue
  // Polyline. Uses the shared routeService (Google Directions → OSRM fallback),
  // so it works whether or not the Google Directions API is enabled on the key.
  // Falls back to a straight line if both providers fail.
  useEffect(() => {
    if (!riderPos || !order) return;
    const target = order.status === 'accepted'
      ? order.pickup.coordinates
      : order.delivery.coordinates;
    if (!target) return;

    // Avoid spamming the routing API: only refetch when the target changed or the
    // rider moved a meaningful distance (~150m).
    const targetChanged = !lastRouteTarget.current
      || lastRouteTarget.current.lat !== target.lat
      || lastRouteTarget.current.lng !== target.lng;
    const moved = !lastRouteOrigin.current
      || Math.hypot(lastRouteOrigin.current.lat - riderPos.lat, lastRouteOrigin.current.lng - riderPos.lng) > 0.0015;
    if (!targetChanged && !moved) return;
    lastRouteOrigin.current = riderPos;
    lastRouteTarget.current = target;

    let cancelled = false;
    (async () => {
      const r = await fetchRoute(riderPos, target);
      if (cancelled) return;
      if (r?.coords?.length) {
        setRouteCoords(r.coords);
        setRouteDistance(r.distance / 1000); // metres → km
        setRouteDuration(r.duration / 60);    // seconds → min
        mapRef.current?.fitToCoordinates(r.coords, {
          edgePadding: { top: 60, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      } else {
        // Routing unavailable — show a straight blue line so the route is still drawn
        const straight = [
          { latitude: riderPos.lat, longitude: riderPos.lng },
          { latitude: target.lat,   longitude: target.lng },
        ];
        setRouteCoords(straight);
        mapRef.current?.fitToCoordinates(straight, {
          edgePadding: { top: 60, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [riderPos?.lat, riderPos?.lng, order?.status]);

  const handlePickupConfirm = async () => {
    if (!otp || otp.length !== 4) {
      return Alert.alert('OTP Galat Hai', 'Customer se 4-digit OTP lo aur enter karo.');
    }
    try {
      setLoading(true);
      const updated = await confirmPickup(orderId, otp);
      setOrder(updated);
      setOtp('');
      setRouteDistance(null);
      setRouteDuration(null);
      showTransitionBanner();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeliveryConfirm = async () => {
    if (!otp || otp.length !== 4) {
      return Alert.alert('OTP Galat Hai', 'Customer se 4-digit OTP lo aur enter karo.');
    }
    try {
      setLoading(true);
      const updated = await confirmDelivery(orderId, otp);
      setOrder(updated);
      setOtp('');
      if (locationWatchId.current !== null) {
        Geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const pickupCoords   = order?.pickup.coordinates;
  const deliveryCoords = order?.delivery.coordinates;
  const isPickup   = order?.status === 'accepted';
  const isDelivery = order?.status === 'picked_up';
  const isDone     = order?.status === 'delivered';

  const startNavigation = () => {
    if (!order) return;
    const target = isPickup ? order.pickup : order.delivery;
    (navigation as any).navigate('Navigation', {
      orderId,
      destination:        target.coordinates,
      label:              isPickup ? 'Pickup' : 'Delivery',
      destinationAddress: target.address,
    });
  };

  const targetCoords = isPickup ? pickupCoords : deliveryCoords;

  const initialRegion = targetCoords
    ? { latitude: targetCoords.lat, longitude: targetCoords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 28.6139, longitude: 77.2090, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const riderLatLng  = riderPos
    ? { latitude: riderPos.lat, longitude: riderPos.lng }
    : null;
  const pickupLatLng   = pickupCoords
    ? { latitude: pickupCoords.lat, longitude: pickupCoords.lng }
    : null;
  const deliveryLatLng = deliveryCoords
    ? { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng }
    : null;

  const stepTitle = isPickup ? 'Pickup Pe Jao' : isDelivery ? 'Delivery Pe Jao' : 'Delivery Ho Gayi!';
  const stepSub   = isPickup
    ? 'Pickup location pe parcel lene jao'
    : isDelivery ? 'Delivery location pe parcel dene jao' : 'Sab steps complete ho gaye';

  const formatDuration = (min: number) =>
    min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}min`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader
        title={stepTitle}
        subtitle={stepSub}
        canGoBack
        onBack={() => navigation.goBack()}
      />

      {/* Map */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}>

          {/* Route: rider → current target (blue Polyline) */}
          {routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#1A73E8"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {/* Rider marker */}
          {riderLatLng && (
            <Marker coordinate={riderLatLng} title="Aap">
              <View style={styles.riderDot}>
                <Text style={{ fontSize: 18 }}>🏍️</Text>
              </View>
            </Marker>
          )}

          {/* Pickup marker */}
          {pickupLatLng && (
            <Marker coordinate={pickupLatLng} title="Pickup" pinColor="green" />
          )}

          {/* Delivery marker */}
          {deliveryLatLng && (
            <Marker coordinate={deliveryLatLng} title="Delivery" pinColor={COLORS.primary} />
          )}
        </MapView>

        {/* Route info overlay */}
        {(routeDistance !== null || routeDuration !== null) && (
          <View style={styles.mapOverlay}>
            {routeDistance !== null && (
              <View style={styles.mapChip}>
                <Text style={styles.mapChipText}>📏 {routeDistance.toFixed(1)} km</Text>
              </View>
            )}
            {routeDuration !== null && (
              <View style={[styles.mapChip, { backgroundColor: COLORS.secondaryBg }]}>
                <Text style={[styles.mapChipText, { color: COLORS.secondary }]}>
                  🕐 {formatDuration(routeDuration)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Step indicator on map */}
        <View style={[styles.stepBadgeOnMap, { backgroundColor: isPickup ? COLORS.success : COLORS.primary }]}>
          <Text style={styles.stepBadgeText}>
            {isPickup ? '● Pickup' : isDone ? '✓ Done' : '● Delivery'}
          </Text>
        </View>

      </View>

      {/* Pickup → Delivery transition banner */}
      {showPickupBanner && (
        <Animated.View style={[styles.transitionBanner, { opacity: bannerAnim, transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <Text style={styles.transitionIcon}>📦✅</Text>
          <View>
            <Text style={styles.transitionTitle}>Parcel Pick Up Ho Gaya!</Text>
            <Text style={styles.transitionSub}>Ab delivery location pe jao 🚀</Text>
          </View>
        </Animated.View>
      )}

      <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>
        {order && (
          <>
            {/* Order header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.orderId}># {order.orderId}</Text>
                <Text style={styles.step}>
                  {isPickup ? 'Step 1/2 — Pickup' : isDelivery ? 'Step 2/2 — Delivery' : 'Completed ✓'}
                </Text>
              </View>
              <StatusBadge status={order.status} />
            </View>

            {/* Earnings banner */}
            <View style={styles.earningBanner}>
              <Text style={styles.earningLabel}>Aapki Kamai</Text>
              <Text style={styles.earningValue}>{formatCurrency(order.riderEarning)}</Text>
            </View>

            {/* Route summary */}
            <View style={styles.routeSummary}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeAddr} numberOfLines={2}>{truncateAddress(order.pickup.address, 80)}</Text>
                  {order.pickup.contactName ? (
                    <Text style={styles.contactText}>👤 {order.pickup.contactName} · {order.pickup.contactPhone}</Text>
                  ) : null}
                </View>
                {isPickup && <View style={styles.activePill}><Text style={styles.activePillText}>JAO</Text></View>}
              </View>
              <View style={styles.routeConnector} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>Delivery</Text>
                  <Text style={styles.routeAddr} numberOfLines={2}>{truncateAddress(order.delivery.address, 80)}</Text>
                  {order.delivery.contactName ? (
                    <Text style={styles.contactText}>👤 {order.delivery.contactName} · {order.delivery.contactPhone}</Text>
                  ) : null}
                </View>
                {isDelivery && <View style={[styles.activePill, { backgroundColor: COLORS.primary }]}><Text style={styles.activePillText}>JAO</Text></View>}
              </View>
            </View>

            {/* Start turn-by-turn navigation */}
            {!isDone && (
              <TouchableOpacity style={styles.navCta} onPress={startNavigation} activeOpacity={0.88}>
                <Text style={styles.navCtaIcon}>🧭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.navCtaText}>Navigation Shuru Karo</Text>
                  <Text style={styles.navCtaSub}>{isPickup ? 'Pickup' : 'Delivery'} tak turn-by-turn directions</Text>
                </View>
                <Text style={styles.navCtaArrow}>›</Text>
              </TouchableOpacity>
            )}

            {/* OTP Section - Pickup */}
            {isPickup && (
              <View style={[styles.otpSection, { borderColor: COLORS.success + '60' }]}>
                <View style={styles.otpHeader}>
                  <Text style={styles.otpIcon}>🔑</Text>
                  <View>
                    <Text style={styles.otpTitle}>Pickup OTP Daalo</Text>
                    <Text style={styles.otpHint}>Customer se OTP lo aur yahan type karo</Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.otpInput, { borderColor: COLORS.success }]}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="_ _ _ _"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  maxLength={4}
                  textAlign="center"
                />
                <Button
                  title="Pickup Confirm Karo"
                  onPress={handlePickupConfirm}
                  loading={loading}
                  variant="success"
                  style={{ marginTop: 4 }}
                />
              </View>
            )}

            {/* OTP Section - Delivery */}
            {isDelivery && (
              <View style={[styles.otpSection, { borderColor: COLORS.primary + '60' }]}>
                <View style={styles.otpHeader}>
                  <Text style={styles.otpIcon}>🔑</Text>
                  <View>
                    <Text style={styles.otpTitle}>Delivery OTP Daalo</Text>
                    <Text style={styles.otpHint}>Customer se OTP lo aur yahan type karo</Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.otpInput, { borderColor: COLORS.primary }]}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="_ _ _ _"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  maxLength={4}
                  textAlign="center"
                />
                <Button
                  title="Delivery Confirm Karo"
                  onPress={handleDeliveryConfirm}
                  loading={loading}
                  variant="primary"
                  style={{ marginTop: 4 }}
                />
              </View>
            )}

            {/* Delivery Complete */}
            {isDone && (
              <View style={styles.doneBanner}>
                <Text style={styles.doneIcon}>🎉</Text>
                <Text style={styles.doneTitle}>Delivery Complete!</Text>
                <Text style={styles.doneSub}>Bahut badhiya kaam kiya! Payment settle ho jaayegi.</Text>
                <View style={styles.doneEarning}>
                  <Text style={styles.doneEarningLabel}>Total Kamai</Text>
                  <Text style={styles.doneEarningValue}>{formatCurrency(order.riderEarning)}</Text>
                </View>
                <Button
                  title="Dashboard Pe Jao"
                  onPress={() => navigation.goBack()}
                  style={{ marginTop: 16 }}
                />
              </View>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  mapWrapper: { height: 280, position: 'relative' },
  map:        { flex: 1 },
  mapOverlay: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', gap: 8,
  },
  mapChip: {
    backgroundColor: COLORS.primaryBg, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  mapChipText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  stepBadgeOnMap: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  stepBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  navCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A73E8', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  navCtaIcon:  { fontSize: 26 },
  navCtaText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  navCtaSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  navCtaArrow: { color: '#fff', fontSize: 28, fontWeight: '300' },

  riderDot: {
    backgroundColor: '#fff', borderRadius: 20, padding: 4,
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },

  // Pickup→Delivery transition banner
  transitionBanner: {
    backgroundColor: COLORS.success, paddingVertical: 14, paddingHorizontal: 20,
    alignItems: 'center', flexDirection: 'row', gap: 12,
  },
  transitionIcon:  { fontSize: 22 },
  transitionTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  transitionSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  sheet: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },

  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  orderId: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  step:    { fontSize: 13, fontWeight: '700', color: COLORS.text },

  earningBanner: {
    backgroundColor: COLORS.successBg, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.success + '30',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  earningLabel: { fontSize: 13, color: COLORS.success, fontWeight: '600' },
  earningValue: { fontSize: 26, fontWeight: '900', color: COLORS.success },

  routeSummary: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  routeRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  routeConnector: { width: 1, height: 18, backgroundColor: COLORS.border, marginLeft: 4.5, marginVertical: 4 },
  routeLabel:     { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.3, marginBottom: 2 },
  routeAddr:      { fontSize: 13, color: COLORS.text, fontWeight: '500', lineHeight: 18 },
  contactText:    { fontSize: 12, color: COLORS.secondary, fontWeight: '600', marginTop: 4 },
  activePill: {
    backgroundColor: COLORS.success, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'center', marginLeft: 6,
  },
  activePillText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },

  otpSection: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: COLORS.success + '40',
  },
  otpHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  otpIcon:   { fontSize: 28 },
  otpTitle:  { fontSize: 16, fontWeight: '800', color: COLORS.text },
  otpHint:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  otpInput: {
    borderWidth: 2, borderRadius: 14,
    fontSize: 36, fontWeight: '900', paddingVertical: 14,
    letterSpacing: 16, color: COLORS.text, marginBottom: 4,
    backgroundColor: COLORS.surface2,
  },

  doneBanner: {
    backgroundColor: COLORS.successBg, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.success + '30',
  },
  doneIcon:  { fontSize: 52, marginBottom: 10 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: COLORS.success, marginBottom: 6 },
  doneSub:   { fontSize: 13, color: COLORS.success + 'CC', textAlign: 'center', lineHeight: 19 },
  doneEarning: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 16,
    marginTop: 16, width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.success + '40',
  },
  doneEarningLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  doneEarningValue: { fontSize: 36, fontWeight: '900', color: COLORS.success },
});

export default ActiveDeliveryScreen;
