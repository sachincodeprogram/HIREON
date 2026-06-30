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

function mapGpsError(err: { code?: number; message?: string }): Error {
  if (err.code === 2) return new Error('GPS_OFF');
  if (err.code === 3) return new Error('GPS_TIMEOUT');
  return new Error(err.message || 'GPS_ERROR');
}

// Sabse accurate fix lao (outdoor par GPS se ~10m). watchPosition se kai
// readings aati hain; hum best-accuracy waali rakhte hain aur target milte hi
// turant resolve. maximumAge:0 => purana cached fix (pichhli jagah ka) kabhi
// use nahi hota — yeh "10m bhi idhar-udhar" drift ka ek bada source hai.
//
// Agar high-accuracy GPS bilkul kuch na de (indoor / signal weak), tabhi
// last-resort network fix lete hain taaki user atke nahi — par GPS hamesha
// pehle, kyunki network 100m+ off ho sakta hai.
export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    // Sirf bahut accurate fix par hi jaldi accept; warna poora window collect
    // karke GPS ko converge hone do (accuracy 30s me 3–5m tak improve hoti hai).
    const ACCURACY_TARGET_M = 8;     // itni accuracy mili to turant accept
    const MAX_WAIT_MS        = 20000; // GPS ko itna time do best fix ke liye
    let best: { lat: number; lng: number; acc: number } | null = null;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (watchId != null) { Geolocation.clearWatch(watchId); watchId = null; }
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const done = (coords: Coordinates) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(coords);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    // GPS window khatam: jo best GPS fix mila wahi do (accurate). Kuch na mila
    // to network par last-resort fallback.
    const onTimeout = () => {
      if (best) { done({ lat: best.lat, lng: best.lng }); return; }
      Geolocation.getCurrentPosition(
        pos => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => fail(mapGpsError(err)),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 10000 },
      );
    };

    watchId = Geolocation.watchPosition(
      pos => {
        const acc = pos.coords.accuracy ?? 9999;
        if (!best || acc < best.acc) {
          best = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc };
        }
        if (best.acc <= ACCURACY_TARGET_M) done({ lat: best.lat, lng: best.lng });
      },
      () => { /* readings na aaye to onTimeout network fallback handle karega */ },
      { enableHighAccuracy: true, timeout: MAX_WAIT_MS, maximumAge: 0, distanceFilter: 0 },
    );

    timer = setTimeout(onTimeout, MAX_WAIT_MS);
  });
}

// Plain lat,lng string — jab koi bhi geocoder address na de paaye.
function coordsFallback(coords: Coordinates): LocationResult {
  return {
    coordinates: coords,
    address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    city: '', state: '', country: '',
  };
}

// Google Geocoding API — best quality, par tabhi chalega jab project me
// "Geocoding API" enable ho. Na ho to null return karo taaki OSM par fall karein.
async function googleReverseGeocode(coords: Coordinates): Promise<LocationResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.results?.length) return null;
    const result = json.results[0];
    const address = result.formatted_address || '';
    let city = '', state = '', country = '';
    for (const comp of result.address_components) {
      if (comp.types.includes('locality')) city = comp.long_name;
      else if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
      else if (comp.types.includes('country')) country = comp.long_name;
    }
    if (!address) return null;
    return { coordinates: coords, address, city, state, country };
  } catch {
    return null;
  }
}

// Free OpenStreetMap (Nominatim) fallback — Google fail hone par full address yahan se.
// Routing wale Google→OSRM fallback ki tarah hi philosophy hai.
async function osmReverseGeocode(coords: Coordinates): Promise<LocationResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HIREON-App', 'Accept-Language': 'en' },
    });
    const json = await res.json();
    const address = json?.display_name || '';
    if (!address) return null;
    const a = json.address || {};
    const city = a.city || a.town || a.village || a.suburb || a.county || '';
    const state = a.state || '';
    const country = a.country || '';
    return { coordinates: coords, address, city, state, country };
  } catch {
    return null;
  }
}

export async function reverseGeocode(coords: Coordinates): Promise<LocationResult> {
  // Google pehle, phir OSM, dono fail to lat,lng dikha do (kabhi crash nahi).
  return (
    (await googleReverseGeocode(coords)) ||
    (await osmReverseGeocode(coords)) ||
    coordsFallback(coords)
  );
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
