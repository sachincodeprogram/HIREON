import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomerTabParamList, CustomerStackParamList } from './types';
import { COLORS } from '../constants/api';
import CustomTabBar from '../components/navigation/CustomTabBar';
import { useTranslation } from '../i18n';

import CustomerDashboard     from '../screens/customer/CustomerDashboard';
import BookParcelScreen      from '../screens/customer/BookParcelScreen';
import OrderHistoryScreen    from '../screens/customer/OrderHistoryScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';
import FareEstimateScreen    from '../screens/customer/FareEstimateScreen';
import LiveTrackingScreen    from '../screens/customer/LiveTrackingScreen';
import SupportHomeScreen     from '../screens/support/SupportHomeScreen';
import SupportChatScreen     from '../screens/support/SupportChatScreen';

const Tab   = createBottomTabNavigator<CustomerTabParamList>();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

const CustomerTabs = () => {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} accent={COLORS.primary} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard"  component={CustomerDashboard}     options={{ title: t('tab.home') }} />
      <Tab.Screen name="BookParcel" component={BookParcelScreen}      options={{ title: t('tab.book') }} />
      <Tab.Screen name="History"    component={OrderHistoryScreen}    options={{ title: t('tab.orders') }} />
    </Tab.Navigator>
  );
};

const CustomerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
    <Stack.Screen name="FareEstimate" component={FareEstimateScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} options={{ animation: 'slide_from_bottom' }} />
    {/* Profile bottom tab me nahi — header ke avatar se khulta hai */}
    <Stack.Screen name="Profile"      component={CustomerProfileScreen} options={{ animation: 'slide_from_right' }} />
    <Stack.Screen name="Support"      component={SupportHomeScreen}  options={{ animation: 'slide_from_right' }} />
    <Stack.Screen name="SupportChat"  component={SupportChatScreen}  options={{ animation: 'slide_from_right' }} />
  </Stack.Navigator>
);

export default CustomerNavigator;
