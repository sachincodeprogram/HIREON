import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import Navbar from '../../components/common/Navbar';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<any, any>;
};

const quickActions = [
  { icon: '🏍️', label: 'Book Now', color: '#FFEBEE' },
  { icon: '📦', label: 'My Bookings', color: '#FFF3E0' },
  { icon: '👤', label: 'Profile', color: '#E8F5E9' },
  { icon: '📍', label: 'Track', color: '#E3F2FD' },
];

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const user = auth().currentUser;
  const firstName = user?.displayName?.split(' ')[0] ?? 'User';

  const handleLogout = async () => {
    await auth().signOut();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Navbar
        rightElement={
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Greeting */}
        <View style={styles.greetingCard}>
          <Text style={styles.greetingText}>Hello, {firstName} 👋</Text>
          <Text style={styles.greetingSubText}>Where do you need help today?</Text>
        </View>

        {/* Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerTextCol}>
            <Text style={styles.bannerTitle}>Quick Hire</Text>
            <Text style={styles.bannerSub}>Find a porter near you in minutes</Text>
            <TouchableOpacity style={styles.bannerBtn}>
              <Text style={styles.bannerBtnText}>Book Now</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.bannerEmoji}>🏃</Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.actionCard, { backgroundColor: item.color }]}
              activeOpacity={0.8}>
              <Text style={styles.actionIcon}>{item.icon}</Text>
              <Text style={styles.actionLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity placeholder */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No recent bookings</Text>
          <Text style={styles.emptySubText}>Your past bookings will appear here</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  greetingCard: {
    marginBottom: 16,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  greetingSubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 2,
  },
  banner: {
    backgroundColor: '#C62828',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    elevation: 3,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  bannerSub: {
    fontSize: 13,
    color: '#FFCDD2',
    marginTop: 4,
    marginBottom: 14,
  },
  bannerBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
  bannerBtnText: {
    color: '#C62828',
    fontWeight: '700',
    fontSize: 13,
  },
  bannerEmoji: {
    fontSize: 56,
    marginLeft: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  actionCard: {
    width: '46%',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    elevation: 1,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    elevation: 1,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
  },
  emptySubText: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
});

export default HomeScreen;
