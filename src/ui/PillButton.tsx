import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, fontSize, PILL_HEIGHT } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

interface PillButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  haptic?: boolean;
}

const bgMap: Record<Variant, string> = {
  primary: colors.accent,
  secondary: colors.surface,
  danger: colors.danger,
  success: colors.success,
  ghost: 'transparent',
};

const labelColorMap: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: colors.text,
  danger: '#FFFFFF',
  success: '#FFFFFF',
  ghost: colors.muted,
};

/**
 * Pill button — fully rounded, height 52-56, thumb-reachable.
 * All primary actions use this component.
 */
export function PillButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  labelStyle,
  haptic = true,
}: PillButtonProps) {
  const handlePress = useCallback(() => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  }, [onPress, haptic]);

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: bgMap[variant] },
        variant === 'secondary' && styles.secondaryBorder,
        variant === 'ghost' && styles.ghostBorder,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={labelColorMap[variant]}
          size="small"
        />
      ) : (
        <View style={styles.inner}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text
            style={[
              styles.label,
              { color: labelColorMap[variant] },
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: PILL_HEIGHT,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    minWidth: 120,
    minHeight: 48,
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.45,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconWrap: {
    marginRight: 2,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
