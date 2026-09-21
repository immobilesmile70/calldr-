import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface AvatarProps {
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Stable color list for avatar backgrounds */
const AVATAR_COLORS = [
  '#5B63FE',
  '#8B7CFF',
  '#3DB9CF',
  '#E06C8D',
  '#F0A500',
  '#43B97F',
  '#E05C5C',
  '#7C6FCD',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

/**
 * Initial-based avatar. Size defaults to 48 (min touch target).
 * Color is deterministic from name so it's stable across renders.
 */
export function Avatar({ name, size = 48, style }: AvatarProps) {
  const initial = useMemo(
    () => (name.trim()[0] ?? '?').toUpperCase(),
    [name],
  );
  const bg = useMemo(() => colorForName(name), [name]);
  const textSize = Math.round(size * 0.38);

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
      accessibilityLabel={`${name} avatar`}
    >
      <Text style={[styles.initial, { fontSize: textSize }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontWeight: '700',
    includeFontPadding: false,
  },
});
