import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setActiveOrder, setRiderCoords } from '../../store/slices/orderSlice';
import { connectSocket, trackOrder, getSocket } from '../../services/socketService';
import { getOrderById, cancelOrder } from '../../services/orderService';
import { fetchRoute } from '../../services/routeService';
import StatusBadge from '../../components/common/StatusBadge';
import Button      from '../../components/common/Button';
import { Order, Coordinates } from '../../types';
import { formatCurrency, truncateAddress } from '../../utils/formatters';

type Route = RouteProp<CustomerStackParamList, 'LiveTracking'>;

const LiveTrackingScreen = () => {
  const route      = useRoute<Route>();
  const navigation = useNavigation();
  const dispatch   = useAppDispatch();
  const { orderId } = route.params;

  const mapRef     = useRef<MapView>(null);
  const [order,    setOrder]    = useState<Order | null>(null);
  const [riderPos, setRiderPos] = useState<Coordinates | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [routeCoords,   setRouteCoords]   = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const lastRouteOrigin = useRef<Coordinates | null>(null);
  const lastRouteTarget = useRef<Coordinates | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const o = await getOrderById(orderId);
        if (mounted) { setOrder(o); dispatch(setActiveOrder(o)); }
        const socket = await connectSocket();
        trackOrder(orderId);
        socket.on('rider_location', (coords: Coordinates) => {
          if (mounted) {
            setRiderPos(coords);
            dispatch(setRiderCoords(coords));
          }
        });
        socket.on('order_update', (update: Partial<Order> & { status: Order['status'] }) => {
          if (mounted) setOrder(prev => prev ? { ...prev, ...update } : prev);
        });
      } catch { /* silent */ }
    };
    init();
    return () => {
      mounted = false;
      getSocket()?.off('rider_location');
      getSocket()?.off('order_update');
    };
  }, [orderId]);

  // Draw the live road route rider → current target (pickup before pickup,
  // delivery after) as a blue Polyline + distance/ETA. Uses the shared
  // routeService (Google Routes → OSRM fallback) so it works even though the
  // Google Directions API is disabled on the key. Straight line if both fail.
  useEffect(() => {
    if (!riderPos || !order) return;
    const target = order.status === 'picked_up'
      ? order.delivery.coordinates
      : order.pickup.coordinates;
    if (!target) return;

    // Throttle: only refetch when the target changed or the rider moved ~150m.
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
          edgePadding: { top: 80, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      } else {
        const straight = [
          { latitude: riderPos.lat, longitude: riderPos.lng },
          { latitude: target.lat,   longitude: target.lng },
        ];
        setRouteCoords(straight);
        mapRef.current?.fitToCoordinates(straight, {
          edgePadding: { top: 80, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [riderPos?.lat, riderPos?.lng, order?.status]);

  const handleCancel = async () => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel?', [
      { text: 'Keep Order', style: 'cancel' },
      {
        text: 'Cancel Order', style: 'destructive', onPress: async () => {
          try {
            setLoading(true);
            const updated = await cancelOrder(orderId, 'Cancelled by customer');
            setOrder(updated);
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setLoading(false); }
        },
      },
    ]);
  };

  const pickupCoords   = order?.pickup.coordinates;
  const deliveryCoords = order?.delivery.coordinates;

  const initialRegion = pickupCoords
    ? { latitude: pickupCoords.lat, longitude: pickupCoords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 28.6139, longitude: 77.2090, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const pickupLatLng   = pickupCoords
    ? { latitude: pickupCoords.lat,   longitude: pickupCoords.lng }
    : null;
  const deliveryLatLng = deliveryCoords
    ? { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng }
    : null;
  const riderLatLng    = riderPos
    ? { latitude: riderPos.lat, longitude: riderPos.lng }
    : null;

  const formatDuration = (min: number) =>
    min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}min`;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation>

        {/* Live road route from rider → pickup / delivery (blue Polyline) */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#1A73E8"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {pickupLatLng && (
          <Marker coordinate={pickupLatLng} title="Pickup" pinColor="green" />
        )}
        {deliveryLatLng && (
          <Marker coordinate={deliveryLatLng} title="Delivery" pinColor={COLORS.primary} />
        )}
        {riderLatLng && (
          <Marker coordinate={riderLatLng} title="Rider">
            <View style={styles.riderMarker}>
              <Text style={{ fontSize: 20 }}>🏍️</Text>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Live ETA / distance chip — rider kitni door hai */}
      {riderPos && order && !['delivered', 'cancelled'].includes(order.status) && (routeDistance !== null || routeDuration !== null) && (
        <View style={styles.etaBanner}>
          <Text style={styles.etaIcon}>🏍️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.etaTitle}>
              {order.status === 'picked_up' ? 'Parcel aa raha hai' : 'Rider aa raha hai'}
            </Text>
            <Text style={styles.etaSub}>
              {routeDuration !== null ? formatDuration(routeDuration) : ''}
              {routeDuration !== null && routeDistance !== null ? ' · ' : ''}
              {routeDistance !== null ? `${routeDistance.toFixed(1)} km door` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Back Button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}>
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSheet}>
        {order ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.orderId}># {order.orderId}</Text>
                <Text style={styles.fare}>{formatCurrency(order.fare.estimated)}</Text>
              </View>
              <StatusBadge status={order.status} />
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {truncateAddress(order.pickup.address)}
                </Text>
              </View>
              <View style={styles.routeConnector} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {truncateAddress(order.delivery.address)}
                </Text>
              </View>
            </View>

            {order.status === 'accepted' && order.pickupOtp && (
              <View style={styles.otpCard}>
                <Text style={styles.otpCardLabel}>🔑 Pickup OTP — Rider ko batao</Text>
                <Text style={styles.otpValue}>{order.pickupOtp}</Text>
                <Text style={styles.otpHintText}>Rider pickup location pe pohonchne par yeh OTP maangega</Text>
              </View>
            )}
            {order.status === 'picked_up' && order.deliveryOtp && (
              <View style={[styles.otpCard, { backgroundColor: COLORS.secondaryBg, borderLeftColor: COLORS.secondary }]}>
                <Text style={[styles.otpCardLabel, { color: COLORS.secondary }]}>🔑 Delivery OTP — Rider ko batao</Text>
                <Text style={[styles.otpValue, { color: COLORS.secondary }]}>{order.deliveryOtp}</Text>
                <Text style={[styles.otpHintText, { color: COLORS.secondary + 'AA' }]}>Rider delivery location pe pohonchne par yeh OTP maangega</Text>
              </View>
            )}

            {order.status === 'delivered' && (
              <View style={styles.deliveredBanner}>
                <Text style={styles.deliveredIcon}>✅</Text>
                <Text style={styles.deliveredTitle}>Parcel Delivered!</Text>
                <Text style={styles.deliveredSub}>Your parcel was delivered successfully</Text>
              </View>
            )}

            {['pending', 'accepted'].includes(order.status) && (
              <Button
                title="Cancel Order"
                onPress={handleCancel}
                variant="danger"
                loading={loading}
                style={{ marginTop: 8 }}
              />
            )}
          </ScrollView>
        ) : (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading order details…</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1 },
  map:         { flex: 1 },
  riderMarker: {
    backgroundColor: '#fff', borderRadius: 20, padding: 6,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },

  etaBanner: {
    position: 'absolute', top: 56, left: 68, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  etaIcon:  { fontSize: 22 },
  etaTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  etaSub:   { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginTop: 1 },

  backBtn: {
    position: 'absolute', top: 56, left: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  backBtnText: { fontSize: 28, fontWeight: '300', color: COLORS.text, lineHeight: 30 },

  bottomSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
    maxHeight: 380,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 10,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderId: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  fare:    { fontSize: 24, fontWeight: '900', color: COLORS.primary },

  routeCard: {
    backgroundColor: COLORS.surface2, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  routeRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:       { width: 8, height: 8, borderRadius: 4 },
  routeConnector: { width: 1, height: 14, backgroundColor: COLORS.border, marginLeft: 3.5, marginVertical: 4 },
  routeText:      { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },

  otpCard: {
    backgroundColor: COLORS.warningBg, borderRadius: 12, padding: 16,
    marginBottom: 10, borderLeftWidth: 4, borderLeftColor: COLORS.warning,
    alignItems: 'center',
  },
  otpCardLabel: { fontSize: 11, color: COLORS.warning, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  otpValue:     { fontSize: 40, fontWeight: '900', color: COLORS.text, letterSpacing: 12, marginBottom: 6 },
  otpHintText:  { fontSize: 11, color: COLORS.warning + 'BB', textAlign: 'center', lineHeight: 16 },

  deliveredBanner: {
    backgroundColor: COLORS.successBg, borderRadius: 14, padding: 20,
    alignItems: 'center', marginBottom: 10,
  },
  deliveredIcon:  { fontSize: 32, marginBottom: 8 },
  deliveredTitle: { fontSize: 17, fontWeight: '800', color: COLORS.success, marginBottom: 4 },
  deliveredSub:   { fontSize: 13, color: COLORS.success + 'AA' },

  loadingWrap: { padding: 24, alignItems: 'center' },
  loadingText: { fontSize: 14, color: COLORS.textMuted },
});

export default LiveTrackingScreen;
