import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, Share, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radii } from '@/theme/tokens';
import { formatCode } from '@shared/code';

interface CodeDisplayProps {
  code: string; // raw 10-char code
  showActions?: boolean;
}

/**
 * Large code display with copy + share actions.
 * Used on Home (zero-state) and the Code bottom sheet.
 */
export function CodeDisplay({ code, showActions = true }: CodeDisplayProps) {
  const formatted = formatCode(code);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(formatted);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [formatted]);

  const handleShare = useCallback(async () => {
    await Share.share({
      message: `Add me on CalLdr: ${formatted}`,
      title: 'My CalLdr code',
    });
  }, [formatted]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Your code</Text>
      <TouchableOpacity
        onPress={handleCopy}
        activeOpacity={0.7}
        accessibilityLabel={`Copy code ${formatted}`}
        accessibilityRole="button"
      >
        <Text style={styles.code}>{formatted}</Text>
        <Text style={styles.tapHint}>Tap to copy</Text>
      </TouchableOpacity>

      {showActions && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCopy}
            accessibilityLabel="Copy code"
          >
            <Ionicons name="copy-outline" size={18} color={colors.accent} />
            <Text style={styles.actionLabel}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShare}
            accessibilityLabel="Share code"
          >
            <Ionicons name="share-outline" size={18} color={colors.accent} />
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: fontSize['3xl'],
    color: colors.accent,
    letterSpacing: 4,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tapHint: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
  },
});
