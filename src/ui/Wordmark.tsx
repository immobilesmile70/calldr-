import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';

interface WordmarkProps {
  style?: StyleProp<TextStyle>;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: fontSize.xl,
  md: fontSize['2xl'],
  lg: fontSize['3xl'],
} as const;

/**
 * "CalLdr" wordmark — exact casing, Ogg-Medium font.
 * Fixed at the top of every main screen.
 */
export function Wordmark({ style, size = 'md' }: WordmarkProps) {
  return (
    <Text style={[styles.wordmark, { fontSize: sizeMap[size] }, style]}>
      CalLdr
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: 'Ogg-Medium',
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: Math.round(fontSize['2xl'] * 1.1),
    includeFontPadding: false,
  },
});
