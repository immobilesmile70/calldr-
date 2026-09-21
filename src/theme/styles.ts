import { StyleSheet, Platform } from 'react-native';
import { colors, spacing, radii, fontSize, PILL_HEIGHT } from './tokens';

/**
 * Shared StyleSheet fragments. Import the ones you need per-component.
 * Do not extend these with one-off overrides — use component-level styles for that.
 */
export const shared = StyleSheet.create({
  // ── Screens ──────────────────────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenPadded: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
  },

  // ── Surface card ─────────────────────────────────────────────────────────
  surface: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },

  // ── Pill button ───────────────────────────────────────────────────────────
  pillBase: {
    height: PILL_HEIGHT,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    minWidth: 120,
  },
  pillPrimary: {
    backgroundColor: colors.accent,
  },
  pillSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillDanger: {
    backgroundColor: colors.danger,
  },
  pillSuccess: {
    backgroundColor: colors.success,
  },
  pillLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.2,
  },
  pillLabelMuted: {
    color: colors.muted,
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  inputBase: {
    height: PILL_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  inputError: {
    borderColor: colors.danger,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  // ── Typography ────────────────────────────────────────────────────────────
  displayText: {
    fontFamily: Platform.select({ android: 'Ogg-Medium', default: 'Ogg-Medium' }),
    fontSize: fontSize['3xl'],
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: Math.round(fontSize['3xl'] * 1.1),
  },
  headingText: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  bodyText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: Math.round(fontSize.md * 1.5),
  },
  mutedText: {
    fontSize: fontSize.md,
    color: colors.muted,
  },
  codeText: {
    fontFamily: Platform.select({ android: 'JetBrainsMono-Regular', default: 'monospace' }),
    fontSize: fontSize.xl,
    color: colors.accent,
    letterSpacing: 2,
  },

  // ── Row / list ────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  // ── Wordmark ──────────────────────────────────────────────────────────────
  wordmark: {
    fontFamily: Platform.select({ android: 'Ogg-Medium', default: 'Ogg-Medium' }),
    fontSize: fontSize['2xl'],
    color: colors.text,
    letterSpacing: -0.5,
  },
});
