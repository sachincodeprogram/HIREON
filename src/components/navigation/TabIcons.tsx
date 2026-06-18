import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

interface IconProps { color: string; size?: number; filled?: boolean }

export const HomeIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.5L12 3L21 10.5V20C21 20.55 20.55 21 20 21H15V16H9V21H4C3.45 21 3 20.55 3 20V10.5Z"
      stroke={color} strokeWidth={filled ? 0 : 2} fill={filled ? color : 'none'}
      strokeLinejoin="round"
    />
    {!filled && (
      <Path d="M9 21V16H15V21" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    )}
  </Svg>
);

export const PackageIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2L2 7V17L12 22L22 17V7L12 2Z"
      stroke={color} strokeWidth={2} fill={filled ? color + '22' : 'none'}
      strokeLinejoin="round"
    />
    <Path d="M2 7L12 12M12 12L22 7M12 12V22" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M7 4.5L17 9.5" stroke={color} strokeWidth={filled ? 0 : 1.5} strokeLinecap="round" />
  </Svg>
);

export const HistoryIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} fill={filled ? color + '18' : 'none'} />
    <Path d="M12 7V12L15 15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ProfileIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={2} fill={filled ? color + '22' : 'none'} />
    <Path d="M4 20C4 17 7.6 14 12 14C16.4 14 20 17 20 20" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export const WalletIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="6" width="20" height="14" rx="2" stroke={color} strokeWidth={2} fill={filled ? color + '18' : 'none'} />
    <Path d="M2 10H22" stroke={color} strokeWidth={2} />
    <Path d="M6 3H18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx="16" cy="15" r="1.5" fill={color} />
  </Svg>
);

export const BikeIcon = ({ color, size = 22, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="5.5" cy="17.5" r="2.5" stroke={color} strokeWidth={2} fill={filled ? color + '22' : 'none'} />
    <Circle cx="18.5" cy="17.5" r="2.5" stroke={color} strokeWidth={2} fill={filled ? color + '22' : 'none'} />
    <Path d="M8 17.5H16" stroke={color} strokeWidth={2} />
    <Path d="M10.5 17.5L13.5 10H17L18.5 17.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M13.5 10L11 7H15.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5.5 17.5L8 10" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);
