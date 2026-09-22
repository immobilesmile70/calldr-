import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Wordmark } from '@/ui/Wordmark';
import { PillButton } from '@/ui/PillButton';
import { colors, spacing, fontSize } from '@/theme/tokens';

/**
 * Landing screen — mobile-oriented.
 * Wordmark + tagline + two pills: "Get started" / "Log in".
 * Same on web.
 */
export default function LandingScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top spacer */}
        <View style={styles.spacer} />

        {/* Wordmark + tagline */}
        <View style={styles.hero}>
          <Wordmark size="lg" />
          <Text style={styles.tagline}>
            Call with a limit. No more, no less.
          </Text>
        </View>

        {/* Bottom actions */}
        <View style={styles.actions}>
          <PillButton
            label="Get started"
            onPress={() => router.push('/(auth)/signup')}
            variant="primary"
            fullWidth
          />
          <PillButton
            label="Log in"
            onPress={() => router.push('/(auth)/login')}
            variant="secondary"
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  spacer: {
    flex: 1,
  },
  hero: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  tagline: {
    fontSize: fontSize.lg,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: Math.round(fontSize.lg * 1.5),
  },
  actions: {
    paddingBottom: Platform.OS === 'web' ? spacing.xl : spacing.lg,
    gap: spacing.md,
  },
});
