/**
 * CalLdr Design Tokens
 *
 * Single source of truth. Import this everywhere — never hardcode colors/spacing.
 */

export const colors = {
  // Backgrounds
  bg: '#0E0E11',
  surface: '#17171C',
  surfaceAlt: '#1E1E24',

  // Text
  text: '#F4F4F6',
  muted: '#8A8A94',

  // Accent (singular — never introduce a second)
  accent: '#8B7CFF',
  accentDim: '#6A5FCC',

  // Semantic
  danger: '#FF4D5E',
  dangerDim: '#C93A48',
  success: '#34D399',
  successDim: '#27A87A',
  warning: '#F59E0B',

  // Borders
  border: '#2A2A32',
  borderFocus: '#8B7CFF',

  // Transparent overlays
  overlay: 'rgba(14,14,17,0.85)',
  shimmer: 'rgba(255,255,255,0.04)',
} as const;

export type ColorKey = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  display: 48,
} as const;

export const lineHeight = {
  tight: 1.1,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.7,
} as const;

/** Pill button height — must stay 52-56 per spec */
export const PILL_HEIGHT = 54;

/** Minimum touch target */
export const MIN_TOUCH = 48;

/** Animation durations (ms) */
export const duration = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
