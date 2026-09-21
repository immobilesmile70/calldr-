import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, fontSize } from '@/theme/tokens';
import { msRemaining } from '@shared/code';

interface CountdownPillProps {
  endsAtMs: number;
  nowMs: number;
  contactName: string;
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const WARNING_THRESHOLD_MS = 60_000;

/**
 * Countdown pill shown at the top of the call screen.
 * Turns warning color (amber) at 60s remaining + triggers parent haptic.
 */
export function CountdownPill({
  endsAtMs,
  nowMs,
  contactName,
}: CountdownPillProps) {
  const remaining = useMemo(
    () => msRemaining(endsAtMs, nowMs),
    [endsAtMs, nowMs],
  );
  const isWarning = remaining > 0 && remaining <= WARNING_THRESHOLD_MS;
  const label = remaining === 0 ? 'Time\'s up' : formatMs(remaining);

  return (
    <View
      style={[styles.pill, isWarning && styles.warning]}
      accessibilityLabel={`${label} remaining, call with ${contactName}`}
      accessibilityRole="timer"
    >
      <Text style={[styles.contact, isWarning && styles.warningText]}>
        {contactName}
      </Text>
      <Text style={[styles.time, isWarning && styles.warningTime]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warning: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: colors.warning,
  },
  contact: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  warningText: {
    color: colors.warning,
  },
  time: {
    fontFamily: 'monospace',
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 1,
  },
  warningTime: {
    color: colors.warning,
  },
});
