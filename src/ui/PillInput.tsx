import React, { useState, useCallback, forwardRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, fontSize, PILL_HEIGHT } from '@/theme/tokens';

interface PillInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  password?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  rightElement?: React.ReactNode;
}

/**
 * Rounded input with label-above, inline error-below, optional show/hide for passwords.
 * Follows WCAG AA contrast: placeholder is colors.muted, error is colors.danger.
 */
export const PillInput = forwardRef<TextInput, PillInputProps>(
  (
    {
      label,
      error,
      hint,
      password = false,
      containerStyle,
      rightElement,
      ...rest
    },
    ref,
  ) => {
    const [focused, setFocused] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const handleFocus = useCallback(() => {
      setFocused(true);
      rest.onFocus?.(undefined as never);
    }, [rest]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      rest.onBlur?.(undefined as never);
    }, [rest]);

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}

        <View
          style={[
            styles.inputWrap,
            focused && styles.focused,
            error ? styles.errorBorder : null,
          ]}
        >
          <TextInput
            ref={ref}
            style={styles.input}
            placeholderTextColor={colors.muted}
            secureTextEntry={password && !showPass}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
          />

          {password ? (
            <TouchableOpacity
              onPress={() => setShowPass((v) => !v)}
              style={styles.iconBtn}
              accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.muted}
              />
            </TouchableOpacity>
          ) : rightElement ? (
            <View style={styles.iconBtn}>{rightElement}</View>
          ) : null}
        </View>

        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

PillInput.displayName = 'PillInput';

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontWeight: '500',
    marginBottom: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  focused: {
    borderColor: colors.accent,
  },
  errorBorder: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    includeFontPadding: false,
  },
  iconBtn: {
    paddingLeft: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.muted,
  },
});
