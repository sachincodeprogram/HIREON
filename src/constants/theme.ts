/**
 * HIREON — design tokens (premium polish).
 *
 * One source of truth for spacing, radius, typography, and elevation so every
 * screen feels consistent. Colours live in `./api` (COLORS) — kept there so the
 * many existing `import { COLORS } from '../constants/api'` lines keep working.
 *
 * Usage:
 *   import { SPACING, RADIUS, TYPE, ELEVATION } from '../../constants/theme';
 *   style={{ padding: SPACING.lg, borderRadius: RADIUS.lg, ...ELEVATION.card }}
 *   <Text style={TYPE.h2}>Title</Text>
 */
import { TextStyle, ViewStyle } from 'react-native';
import { COLORS } from './api';

/* ─────────────────────────── spacing (4pt grid) ─────────────────────────── */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/* ─────────────────────────────── radii ─────────────────────────────────── */
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/* ───────────────────────────── font weights ────────────────────────────── */
export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

/* ───────────────────────── typography presets ──────────────────────────── */
// Consistent type scale. Spread into a Text style; override `color` per use.
export const TYPE: Record<string, TextStyle> = {
  display: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, color: COLORS.text },
  h1:      { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, color: COLORS.text },
  h2:      { fontSize: 20, fontWeight: '800', letterSpacing: -0.2, color: COLORS.text },
  title:   { fontSize: 17, fontWeight: '700', letterSpacing: -0.1, color: COLORS.text },
  body:    { fontSize: 15, fontWeight: '500', color: COLORS.text },
  bodyMuted:{ fontSize: 15, fontWeight: '500', color: COLORS.textMuted },
  label:   { fontSize: 13, fontWeight: '600', color: COLORS.text, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
  overline:{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
};

/* ───────────────────────── elevation / shadows ─────────────────────────── */
// Softer, layered shadows for a premium feel. `card` is the default surface.
export const ELEVATION: Record<string, ViewStyle> = {
  none: { shadowColor: 'transparent', elevation: 0 },
  xs: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  card: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 14, elevation: 3,
  },
  md: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  lg: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14, shadowRadius: 28, elevation: 10,
  },
};

// Coloured glow used under primary CTAs.
export const glow = (color: string, opacity = 0.3): ViewStyle => ({
  shadowColor: color, shadowOffset: { width: 0, height: 6 },
  shadowOpacity: opacity, shadowRadius: 14, elevation: 5,
});

export default { SPACING, RADIUS, WEIGHT, TYPE, ELEVATION, glow };
