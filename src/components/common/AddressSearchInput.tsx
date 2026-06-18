import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Vibration,
} from 'react-native';
import { GooglePlacesAutocomplete, GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';
import { COLORS, GOOGLE_MAPS_API_KEY } from '../../constants/api';
import { getCurrentLocation } from '../../services/locationService';
import { Coordinates } from '../../types';

interface Props {
  label: string;
  placeholder: string;
  leftIcon?: string;
  showCurrentLocation?: boolean;
  onSelect: (address: string, coords: Coordinates) => void;
}

const AddressSearchInput: React.FC<Props> = ({
  label,
  placeholder,
  leftIcon = '📍',
  showCurrentLocation = false,
  onSelect,
}) => {
  const ref = useRef<GooglePlacesAutocompleteRef>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locSuccess, setLocSuccess] = useState(false);

  const handleCurrentLocation = async () => {
    Vibration.vibrate(40);
    setLocLoading(true);
    setLocSuccess(false);
    try {
      const result = await getCurrentLocation();
      const displayAddress = result.address || `${result.coordinates.lat.toFixed(5)}, ${result.coordinates.lng.toFixed(5)}`;
      ref.current?.setAddressText(displayAddress);
      onSelect(displayAddress, result.coordinates);
      setLocSuccess(true);
      Vibration.vibrate(60);
      setTimeout(() => setLocSuccess(false), 2000);
    } catch {
      // Alerts are shown inside getCurrentLocation()
    } finally {
      setLocLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      {/* Search input row */}
      <View style={styles.inputBox}>
        <Text style={styles.icon}>{leftIcon}</Text>
        <GooglePlacesAutocomplete
          ref={ref}
          placeholder={placeholder}
          fetchDetails
          onPress={(data, details) => {
            if (!details) return;
            const { lat, lng } = details.geometry.location;
            onSelect(data.description, { lat, lng });
          }}
          query={{
            key: GOOGLE_MAPS_API_KEY,
            language: 'en',
            components: 'country:in',
          }}
          styles={{
            textInput: styles.textInput,
            listView: styles.listView,
            row: styles.listRow,
            description: styles.listDesc,
            separator: styles.separator,
          }}
          enablePoweredByContainer={false}
          textInputProps={{ placeholderTextColor: COLORS.textLight, autoCorrect: false }}
          debounce={300}
          minLength={3}
        />
      </View>

      {/* GPS button — separate row below input to avoid touch conflicts */}
      {showCurrentLocation && (
        <TouchableOpacity
          style={[
            styles.gpsBtn,
            locLoading && styles.gpsBtnLoading,
            locSuccess && styles.gpsBtnSuccess,
          ]}
          onPress={handleCurrentLocation}
          disabled={locLoading}
          activeOpacity={0.75}>
          {locLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.gpsIcon}>{locSuccess ? '✅' : '🎯'}</Text>
          )}
          <Text style={[
            styles.gpsBtnText,
            locLoading && { color: COLORS.textMuted },
            locSuccess && { color: COLORS.success },
          ]}>
            {locLoading ? 'Location dhoondh rahe hain...' : locSuccess ? 'Location mil gayi!' : 'Current Location Use Karo'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: {
    fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    overflow: 'visible',
    zIndex: 10,
  },
  icon: { paddingTop: 13, paddingLeft: 12, fontSize: 16 },
  textInput: {
    fontSize: 14, color: COLORS.text,
    paddingHorizontal: 8, paddingVertical: 0,
    height: 44, backgroundColor: 'transparent',
    flex: 1,
  },
  listView: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    marginTop: 2, elevation: 10, zIndex: 9999,
    position: 'absolute', top: 44, left: -36, right: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12,
  },
  listRow: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: COLORS.surface },
  listDesc: { fontSize: 13, color: COLORS.text },
  separator: { height: 1, backgroundColor: COLORS.border },

  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.primaryBg,
  },
  gpsBtnLoading: { borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
  gpsBtnSuccess: { borderColor: COLORS.success + '60', backgroundColor: COLORS.successBg },
  gpsIcon: { fontSize: 16 },
  gpsBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});

export default AddressSearchInput;
