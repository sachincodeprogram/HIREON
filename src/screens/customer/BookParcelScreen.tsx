import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Alert,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import { ParcelSize, LocationInfo, ParcelInfo, Coordinates } from '../../types';
import Input          from '../../components/common/Input';
import Button         from '../../components/common/Button';
import Card           from '../../components/common/Card';
import ScreenHeader   from '../../components/navigation/ScreenHeader';
import AddressSearchInput from '../../components/common/AddressSearchInput';
import { estimateFare }   from '../../services/orderService';

const SIZES: { value: ParcelSize; label: string; desc: string; icon: string }[] = [
  { value: 'small',  label: 'Small',  icon: '📄', desc: 'Documents, phone, small items (≤1 kg)' },
  { value: 'medium', label: 'Medium', icon: '👟', desc: 'Shoes, books, medium items (1–5 kg)' },
  { value: 'large',  label: 'Large',  icon: '📦', desc: 'Clothes, large boxes (5–20 kg)' },
];

const DEFAULT_COORDS: Coordinates = { lat: 28.6139, lng: 77.2090 };

const BookParcelScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();

  const [pickupAddress,    setPickupAddress]    = useState('');
  const [pickupCoords,     setPickupCoords]     = useState<Coordinates>(DEFAULT_COORDS);
  const [pickupContact,    setPickupContact]    = useState('');
  const [pickupPhone,      setPickupPhone]      = useState('');

  const [deliveryAddress,  setDeliveryAddress]  = useState('');
  const [deliveryCoords,   setDeliveryCoords]   = useState<Coordinates>(DEFAULT_COORDS);
  const [deliveryContact,  setDeliveryContact]  = useState('');
  const [deliveryPhone,    setDeliveryPhone]    = useState('');

  const [description,      setDescription]      = useState('');
  const [weight,           setWeight]           = useState('1');
  const [size,             setSize]             = useState<ParcelSize>('small');
  const [isFragile,        setIsFragile]        = useState(false);
  const [loading,          setLoading]          = useState(false);

  const handlePickupSelect = (address: string, coords: Coordinates) => {
    setPickupAddress(address);
    setPickupCoords(coords);
  };

  const handleDeliverySelect = (address: string, coords: Coordinates) => {
    setDeliveryAddress(address);
    setDeliveryCoords(coords);
  };

  const handleEstimate = async () => {
    if (!pickupAddress.trim() || !deliveryAddress.trim()) {
      return Alert.alert('Missing Address', 'Please select pickup and delivery addresses.');
    }
    try {
      setLoading(true);
      const parcel: ParcelInfo = {
        description: description || 'Parcel',
        weight: parseFloat(weight) || 1,
        size,
        isFragile,
      };
      const pickup: LocationInfo = {
        address: pickupAddress,
        coordinates: pickupCoords,
        contactName: pickupContact,
        contactPhone: pickupPhone,
      };
      const delivery: LocationInfo = {
        address: deliveryAddress,
        coordinates: deliveryCoords,
        contactName: deliveryContact,
        contactPhone: deliveryPhone,
      };
      const estimate = await estimateFare({ pickup: pickupCoords, delivery: deliveryCoords, parcel });
      navigation.navigate('FareEstimate', { pickup, delivery, parcel, estimate });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader title="Book Parcel" subtitle="Schedule a new delivery" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled>

          {/* Pickup */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.sectionTitle}>Pickup Location</Text>
            </View>
            <Card style={{ zIndex: 20, overflow: 'visible' }}>
              <AddressSearchInput
                label="Address"
                placeholder="Search pickup address"
                leftIcon="📍"
                showCurrentLocation
                onSelect={handlePickupSelect}
              />
              <Input
                label="Contact Name"
                value={pickupContact}
                onChangeText={setPickupContact}
                placeholder="Sender's name"
                leftIcon="👤"
              />
              <Input
                label="Contact Phone"
                value={pickupPhone}
                onChangeText={setPickupPhone}
                placeholder="Sender's phone"
                keyboardType="phone-pad"
                leftIcon="📞"
              />
            </Card>
          </View>

          {/* Delivery */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.sectionTitle}>Delivery Location</Text>
            </View>
            <Card style={{ zIndex: 10, overflow: 'visible' }}>
              <AddressSearchInput
                label="Address"
                placeholder="Search delivery address"
                leftIcon="🏁"
                onSelect={handleDeliverySelect}
              />
              <Input
                label="Contact Name"
                value={deliveryContact}
                onChangeText={setDeliveryContact}
                placeholder="Receiver's name"
                leftIcon="👤"
              />
              <Input
                label="Contact Phone"
                value={deliveryPhone}
                onChangeText={setDeliveryPhone}
                placeholder="Receiver's phone"
                keyboardType="phone-pad"
                leftIcon="📞"
              />
            </Card>
          </View>

          {/* Parcel Info */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionDot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.sectionTitle}>Parcel Details</Text>
            </View>
            <Card>
              <Input
                label="Description (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="What are you sending?"
                leftIcon="📝"
              />
              <Input
                label="Weight (kg)"
                value={weight}
                onChangeText={setWeight}
                placeholder="1.0"
                keyboardType="decimal-pad"
                leftIcon="⚖️"
              />

              <Text style={styles.fieldLabel}>Parcel Size</Text>
              <View style={styles.sizeGrid}>
                {SIZES.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.sizeCard, size === s.value && styles.sizeCardActive]}
                    onPress={() => setSize(s.value)}
                    activeOpacity={0.8}>
                    <Text style={styles.sizeIcon}>{s.icon}</Text>
                    <Text style={[styles.sizeLabel, size === s.value && styles.sizeLabelActive]}>
                      {s.label}
                    </Text>
                    <Text style={styles.sizeDesc} numberOfLines={2}>{s.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Text style={styles.switchLabel}>Fragile Item</Text>
                  <Text style={styles.switchSub}>Extra care handling (+₹20)</Text>
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

          <Button
            title="Get Fare Estimate"
            onPress={handleEstimate}
            loading={loading}
            icon="→"
            style={styles.btn}
          />
          <View style={{ height: 12 }} />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  sectionBlock: { marginBottom: 4 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 14 },
  sectionDot:   { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },

  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: COLORS.text,
    marginBottom: 12, marginTop: 4,
  },

  sizeGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sizeCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border,
    padding: 12, alignItems: 'center', backgroundColor: COLORS.surface2,
  },
  sizeCardActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg,
  },
  sizeIcon:       { fontSize: 22, marginBottom: 4 },
  sizeLabel:      { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  sizeLabelActive:{ color: COLORS.primary },
  sizeDesc:       { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', lineHeight: 13 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  switchLeft: { flex: 1 },
  switchLabel:{ fontSize: 14, fontWeight: '700', color: COLORS.text },
  switchSub:  { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  btn: { marginTop: 8 },
});

export default BookParcelScreen;
