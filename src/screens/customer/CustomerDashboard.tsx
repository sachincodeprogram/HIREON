import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { ELEVATION, glow } from '../../constants/theme';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import useAppSelector   from '../../hooks/useAppSelector';
import { setOrders, setOrderLoading } from '../../store/slices/orderSlice';
import { getMyOrders } from '../../services/orderService';
import Card        from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import { formatCurrency, formatDateTime, truncateAddress } from '../../utils/formatters';

const CustomerDashboard = () => {
  const dispatch   = useAppDispatch();
  const profile    = useAppSelector(s => s.auth.profile);
  const orders     = useAppSelector(s => s.order.orders);
  const loading    = useAppSelector(s => s.order.loading);
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();

  const loadOrders = useCallback(async () => {
    try {
      dispatch(setOrderLoading(true));
      const list = await getMyOrders();
      dispatch(setOrders(list));
    } catch { /* silent */ }
    finally { dispatch(setOrderLoading(false)); }
  }, []);

  useEffect(() => { loadOrders(); }, []);

  const activeOrders  = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const recentOrders  = orders.slice(0, 5);
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const firstName     = profile?.name?.split(' ')[0] || 'User';

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOrders} colors={[COLORS.primary]} />}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.name}>{firstName} 👋</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{deliveredCount}</Text>
              <Text style={styles.statLabel}>Delivered</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{activeOrders.length}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
          </View>
        </View>

        {/* Book CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={styles.bookCta}
            onPress={() => navigation.navigate('CustomerTabs', { screen: 'BookParcel' } as any)}
            activeOpacity={0.88}>
            <View>
              <Text style={styles.ctaLabel}>Ready to send?</Text>
              <Text style={styles.ctaTitle}>Book a Parcel</Text>
            </View>
            <View style={styles.ctaIconBox}>
              <Text style={styles.ctaIcon}>📦</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Orders</Text>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>{activeOrders.length}</Text>
              </View>
            </View>
            {activeOrders.map(order => (
              <TouchableOpacity
                key={order._id}
                onPress={() =>
                  ['accepted', 'picked_up', 'in_transit'].includes(order.status)
                    ? navigation.navigate('LiveTracking', { orderId: order._id })
                    : null
                }
                activeOpacity={0.8}>
                <Card accent={COLORS.primary}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.orderId}># {order.orderId}</Text>
                    <StatusBadge status={order.status} />
                  </View>
                  <View style={styles.routeBlock}>
                    <View style={styles.routeRow}>
                      <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                      <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(order.pickup.address)}</Text>
                    </View>
                    <View style={styles.routeConnector} />
                    <View style={styles.routeRow}>
                      <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                      <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(order.delivery.address)}</Text>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.fareText}>{formatCurrency(order.fare.estimated)}</Text>
                    {['accepted', 'picked_up', 'in_transit'].includes(order.status) && (
                      <Text style={styles.trackHint}>Tap to track →</Text>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent Orders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          {loading && orders.length === 0 ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : recentOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Your delivery history will appear here</Text>
            </View>
          ) : (
            recentOrders.map(order => (
              <Card key={order._id}>
                <View style={styles.cardHeader}>
                  <Text style={styles.orderId}># {order.orderId}</Text>
                  <StatusBadge status={order.status} />
                </View>
                <View style={styles.routeBlock}>
                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(order.pickup.address)}</Text>
                  </View>
                  <View style={styles.routeConnector} />
                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                    <Text style={styles.routeText} numberOfLines={1}>{truncateAddress(order.delivery.address)}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.fareText}>{formatCurrency(order.fare.estimated)}</Text>
                  <Text style={styles.dateText}>{formatDateTime(order.createdAt)}</Text>
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 28,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    ...glow(COLORS.primary, 0.25),
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  name:     { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  statsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, paddingVertical: 14,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 22, fontWeight: '900', color: '#fff' },
  statLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  ctaWrap: { paddingHorizontal: 16, marginTop: -1 },
  bookCta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: 20, padding: 20, marginTop: 16,
    ...glow(COLORS.ink, 0.28),
  },
  ctaLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  ctaTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  ctaIconBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaIcon: { fontSize: 26 },

  section:       { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: COLORS.text },
  activePill: {
    backgroundColor: COLORS.primary,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  activePillText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  orderId: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },

  routeBlock:    { marginBottom: 10 },
  routeRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:      { width: 8, height: 8, borderRadius: 4 },
  routeConnector:{ width: 1, height: 12, backgroundColor: COLORS.border, marginLeft: 3.5, marginVertical: 2 },
  routeText:     { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10,
  },
  fareText:  { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  dateText:  { fontSize: 11, color: COLORS.textLight },
  trackHint: { fontSize: 12, color: COLORS.secondary, fontWeight: '700' },

  emptyState:    { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: COLORS.textMuted },
});

export default CustomerDashboard;
