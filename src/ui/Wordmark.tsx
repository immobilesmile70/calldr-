import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';

interface WordmarkProps {
  style?: StyleProp<TextStyle>;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { fontSize: fontSize.xl, lineHeight: Math.round(fontSize.xl * 1.4) },
  md: { fontSize: fontSize['2xl'], lineHeight: Math.round(fontSize['2xl'] * 1.4) },
  lg: { fontSize: fontSize['3xl'], lineHeight: Math.round(fontSize['3xl'] * 1.4) },
} as const;

/**
 * "CalLdr" wordmark — exact casing, Ogg-Medium font.
 * Fixed at the top of every main screen.
 */
export function Wordmark({ style, size = 'md' }: WordmarkProps) {
  const config = sizeConfig[size];
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize: config.fontSize,
          lineHeight: config.lineHeight,
        },
        style,
      ]}
    >
      CalLdr
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: 'Ogg-Medium',
    color: colors.text,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
});
