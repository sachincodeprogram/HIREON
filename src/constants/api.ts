// Environment-specific values (dev vs prod) live in src/config/env.ts and are
// selected by the __DEV__ flag. Re-exported here so existing imports keep working.
import { ENV } from '../config/env';

export const BASE_URL            = ENV.API_BASE_URL;
export const SOCKET_URL          = ENV.SOCKET_URL;
export const GOOGLE_MAPS_API_KEY = ENV.GOOGLE_MAPS_API_KEY;
export const OSRM_BASE_URL       = ENV.OSRM_BASE_URL;

export const COLORS = {
  primary:      '#C62828',
  primaryDark:  '#8E0000',
  primaryLight: '#EF5350',
  primaryBg:    '#FFF5F5',
  secondary:    '#1D4ED8',
  secondaryDark:'#1E3A8A',
  secondaryBg:  '#EFF6FF',
  background:   '#F7F8FA',
  surface:      '#FFFFFF',
  surface2:     '#F1F5F9',
  text:         '#0F172A',
  textMuted:    '#64748B',
  textLight:    '#94A3B8',
  border:       '#E2E8F0',
  borderDark:   '#CBD5E1',
  success:      '#16A34A',
  successBg:    '#F0FDF4',
  warning:      '#D97706',
  warningBg:    '#FFFBEB',
  error:        '#DC2626',
  online:       '#10B981',
  offline:      '#94A3B8',
  ink:          '#0B1220',  // deep near-black for premium dark CTAs / surfaces
  overlay:      'rgba(11,18,32,0.45)', // modal scrim
};

export const SHADOW = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};

export const STATUS_COLORS: Record<string, string> = {
  pending:    '#F57F17',
  accepted:   '#1565C0',
  picked_up:  '#6A1B9A',
  in_transit: '#00838F',
  delivered:  '#2E7D32',
  cancelled:  '#C62828',
};

export const STATUS_LABELS: Record<string, string> = {
  pending:    'Pending',
  accepted:   'Accepted',
  picked_up:  'Picked Up',
  in_transit: 'In Transit',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};
