import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import LoginScreen      from '../screens/auth/LoginScreen';
import SignupScreen     from '../screens/auth/SignupScreen';
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login"      component={LoginScreen} />
    <Stack.Screen name="Signup"     component={SignupScreen} />
    <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
  </Stack.Navigator>
);

export default AuthNavigator;
