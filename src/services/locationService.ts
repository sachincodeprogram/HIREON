import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { GOOGLE_MAPS_API_KEY } from '../constants/api';
import { Coordinates } from '../types';

export type LocationResult = {
  coordinates: Coordinates;
  address: string;
  city: string;
  state: string;
  country: string;
};

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

export async function requestLocationPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'granted';
  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (already) return 'granted';

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'App ko aapki location chahiye pickup address fill karne ke liye.',
        buttonNeutral: 'Baad mein',
        buttonNegative: 'Deny',
        buttonPositive: 'Allow',
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'unavailable';
  }
}

export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    // Try high accuracy first (GPS satellite), fallback to network-based on timeout
    Geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        Geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          err => {
            if (err.code === 2) reject(new Error('GPS_OFF'));
            else if (err.code === 3) reject(new Error('GPS_TIMEOUT'));
            else reject(new Error(err.message));
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
        );
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 },
    );
  });
}

export async function reverseGeocode(coords: Coordinates): Promise<LocationResult> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.results?.length) {
      return { coordinates: coords, address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, city: '', state: '', country: '' };
    }
    const result = json.results[0];
    const address = result.formatted_address || '';
    let city = '', state = '', country = '';
    for (const comp of result.address_components) {
      if (comp.types.includes('locality')) city = comp.long_name;
      else if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
      else if (comp.types.includes('country')) country = comp.long_name;
    }
    return { coordinates: coords, address, city, state, country };
  } catch {
    return { coordinates: coords, address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, city: '', state: '', country: '' };
  }
}

export async function getCurrentLocation(): Promise<LocationResult> {
  const status = await requestLocationPermission();
  if (status === 'blocked') {
    Alert.alert(
      'Location Block Hai',
      'Settings mein jaake Location permission enable karo.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings Kholo', onPress: () => Linking.openSettings() },
      ],
    );
    throw new Error('PERMISSION_BLOCKED');
  }
  if (status !== 'granted') {
    Alert.alert('Permission Denied', 'Location permission nahi mili. Please allow karo.');
    throw new Error('PERMISSION_DENIED');
  }
  try {
    const coords = await getCurrentPosition();
    return reverseGeocode(coords);
  } catch (err: any) {
    if (err.message === 'GPS_OFF') {
      Alert.alert('GPS Band Hai', 'Phone ka GPS/Location on karo aur dobara try karo.');
    } else if (err.message === 'GPS_TIMEOUT') {
      Alert.alert('Location Nahi Mili', 'GPS signal slow hai. Bahar jaake dobara try karo ya address manually type karo.');
    } else {
      Alert.alert('Error', 'Location nahi mil rahi. Manually address type karo.');
    }
    throw err;
  }
}

// Haversine formula - straight line distance in km
export function getDistanceKm(from: Coordinates, to: Coordinates): number {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
