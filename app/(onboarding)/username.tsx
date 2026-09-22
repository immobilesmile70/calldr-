import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Wordmark } from '@/ui/Wordmark';
import { PillInput } from '@/ui/PillInput';
import { PillButton } from '@/ui/PillButton';
import { useAuth } from '@/lib/useAuth';
import { getIdToken } from '@/firebase/auth';
import { colors, spacing, fontSize } from '@/theme/tokens';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export default function UsernameScreen() {
  const { refreshUserDoc } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    setError('');
    const trimmed = username.trim();
    if (trimmed.length < 2) { setError('Username must be at least 2 characters'); return; }
    if (trimmed.length > 20) { setError('Username must be at most 20 characters'); return; }

    setLoading(true);
    try {
      const idToken = await getIdToken();
      const resp = await fetch(`${API_URL}/profile/username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Failed to save username. Try again.');
        return;
      }
      // Trigger re-read of user doc — root layout will redirect to home
      refreshUserDoc();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [username, refreshUserDoc]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.spacer} />

          <View style={styles.hero}>
            <Wordmark />
            <Text style={styles.heading}>Choose a display name</Text>
            <Text style={styles.subtext}>
              This is how others will see you. You can change it later.
            </Text>
          </View>

          <PillInput
            label="Display name"
            value={username}
            onChangeText={setUsername}
            error={error}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            hint="2 to 20 characters"
          />

          <PillButton
            label="Continue"
            onPress={handleContinue}
            loading={loading}
            fullWidth
          />

          <View style={styles.spacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  spacer: { flex: 1, minHeight: spacing.xl },
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heading: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtext: { fontSize: fontSize.md, color: colors.muted, lineHeight: Math.round(fontSize.md * 1.5) },
});
