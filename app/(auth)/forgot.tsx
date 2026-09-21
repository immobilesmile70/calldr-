import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '@/ui/Wordmark';
import { PillInput } from '@/ui/PillInput';
import { PillButton } from '@/ui/PillButton';
import { colors, spacing, fontSize } from '@/theme/tokens';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export default function ForgotScreen() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = useCallback(async () => {
    setEmailError('');
    if (!email.trim()) { setEmailError('Email is required'); return; }

    setLoading(true);
    try {
      await fetch(`${API_URL}/auth/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always show generic success — no user enumeration
      setSent(true);
    } catch {
      setSent(true); // Still show generic success
    } finally {
      setLoading(false);
    }
  }, [email]);

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
          <TouchableOpacity
            style={styles.back}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.muted} />
          </TouchableOpacity>

          <Wordmark style={styles.wordmark} />
          <Text style={styles.heading}>Reset password</Text>

          {sent ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={36} color={colors.success} />
              <Text style={styles.successText}>
                If an account exists for this email, a reset link has been sent.
              </Text>
              <PillButton
                label="Back to log in"
                onPress={() => router.replace('/(auth)/login')}
                variant="secondary"
                fullWidth
                style={styles.backBtn}
              />
            </View>
          ) : (
            <>
              <Text style={styles.subtext}>
                Enter your email and we will send you a reset link.
              </Text>
              <PillInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={emailError}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleSend}
              />
              <PillButton
                label="Send reset link"
                onPress={handleSend}
                loading={loading}
                fullWidth
                style={styles.primaryBtn}
              />
            </>
          )}
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
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  back: { alignSelf: 'flex-start', padding: spacing.xs, marginBottom: spacing.sm },
  wordmark: { marginBottom: spacing.sm },
  heading: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtext: { fontSize: fontSize.md, color: colors.muted },
  primaryBtn: { marginTop: spacing.xs },
  successBox: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  successText: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: Math.round(fontSize.md * 1.5),
  },
  backBtn: { marginTop: spacing.md },
});
