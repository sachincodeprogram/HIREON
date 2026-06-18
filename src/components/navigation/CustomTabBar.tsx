import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/api';
import {
  HomeIcon, PackageIcon, HistoryIcon, ProfileIcon, WalletIcon, BikeIcon,
} from './TabIcons';

interface Props extends BottomTabBarProps {
  accent: string;
}

const ICON_MAP: Record<string, (props: { color: string; filled: boolean }) => React.ReactElement> = {
  Dashboard: ({ color, filled }) => <HomeIcon    color={color} filled={filled} />,
  BookParcel:({ color, filled }) => <PackageIcon color={color} filled={filled} />,
  History:   ({ color, filled }) => <HistoryIcon color={color} filled={filled} />,
  Profile:   ({ color, filled }) => <ProfileIcon color={color} filled={filled} />,
  Earnings:  ({ color, filled }) => <WalletIcon  color={color} filled={filled} />,
  Rider:     ({ color, filled }) => <BikeIcon    color={color} filled={filled} />,
};

const CustomTabBar: React.FC<Props> = ({ state, descriptors, navigation, accent }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom || 8 }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel as string) || options.title || route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          const iconColor = isFocused ? accent : COLORS.textLight;
          const IconComponent = ICON_MAP[route.name];

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={0.7}>
              <View style={[styles.iconWrap, isFocused && { backgroundColor: accent + '15' }]}>
                {IconComponent
                  ? <IconComponent color={iconColor} filled={isFocused} />
                  : null}
              </View>
              <Text style={[styles.label, { color: iconColor }, isFocused && styles.labelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 14,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  iconWrap: {
    width: 50,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: '700',
  },
});

export default CustomTabBar;
