import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { useSelector } from 'react-redux';

import { RootStackParamList } from './types';
import { COLORS } from '../constants/api';
import SplashScreen      from '../screens/SplashScreen';
import AuthNavigator     from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import RiderNavigator    from './RiderNavigator';

import { useAppDispatch } from '../hooks/useAppDispatch';
import { setProfile, clearAuth } from '../store/slices/authSlice';
import { getMyProfile } from '../services/authService';
import { getDevPhone } from '../services/apiClient';
import type { RootState } from '../store';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const dispatch = useAppDispatch();
  const profile  = useSelector((state: RootState) => state.auth.profile);
  const role     = profile?.role ?? null;

  const [showSplash,   setShowSplash]   = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthTypes.User | null>(null);

  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (u) => {
      setFirebaseUser(u);
      if (u) {
        try {
          const p = await getMyProfile();
          dispatch(setProfile(p));
        } catch {
          // Firebase user exists but no DB profile yet — stay on Auth to complete signup
          dispatch(clearAuth());
        }
      } else {
        // Dev mode test login: devPhone set hai to clearAuth mat karo
        if (!(__DEV__ && getDevPhone())) {
          dispatch(clearAuth());
        }
      }
      setInitializing(false);
    });
    return unsub;
  }, []);

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {(!firebaseUser && !profile) ? (
          <Stack.Screen name="Auth"     component={AuthNavigator} />
        ) : role === 'customer' ? (
          <Stack.Screen name="Customer" component={CustomerNavigator} />
        ) : role === 'rider' ? (
          <Stack.Screen name="Rider"    component={RiderNavigator} />
        ) : (
          // Firebase user exists but no DB profile — go to Auth to complete signup
          <Stack.Screen name="Auth"     component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
