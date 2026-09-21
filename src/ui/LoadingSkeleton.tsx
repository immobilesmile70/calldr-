import React from 'react';
import { View, StyleSheet, Animated, StyleProp, ViewStyle } from 'react-native';
import { colors, radii } from '@/theme/tokens';

interface LoadingSkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Skeleton loader — shifting shimmer matching the final layout shape.
 * Use multiple instances to match the final content shape.
 */
export function LoadingSkeleton({
  width = '100%',
  height = 20,
  borderRadius = radii.sm,
  style,
}: LoadingSkeletonProps) {
  const shimmer = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0.15],
  });

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading..."
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
  },
});
