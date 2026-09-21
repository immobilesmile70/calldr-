import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Google from '@react-native-google-signin/google-signin';
import { Wordmark } from '@/ui/Wordmark';
import { PillInput } from '@/ui/PillInput';
import { PillButton } from '@/ui/PillButton';
import { signInWithToken } from '@/firebase/auth';
import { colors, spacing, fontSize } from '@/theme/tokens';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const clearErrors = () => {
    setEmailError('');
    setPasswordError('');
    setGeneralError('');
  };

  const handleLogin = useCallback(async () => {
    clearErrors();
    let valid = true;
    if (!email.trim()) { setEmailError('Email is required'); valid = false; }
    if (!password) { setPasswordError('Password is required'); valid = false; }
    if (!valid) return;

    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await resp.json() as { ok: boolean; data?: { customToken: string }; error?: string; code?: string };

      if (!data.ok) {
        if (data.code === 'BAD_CREDENTIALS') {
          setGeneralError('Incorrect email or password.');
        } else {
          setGeneralError(data.error ?? 'Login failed. Please try again.');
        }
        return;
      }

      await signInWithToken(data.data!.customToken);
    } catch {
      setGeneralError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  const handleGoogle = useCallback(async () => {
    setGoogleLoading(true);
    clearErrors();
    try {
      await Google.GoogleSignin.hasPlayServices();
      const userInfo = await Google.GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token');

      const resp = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await resp.json() as { ok: boolean; data?: { customToken: string }; error?: string };
      if (!data.ok) { setGeneralError(data.error ?? 'Google sign in failed.'); return; }
      await signInWithToken(data.data!.customToken);
    } catch (err) {
      if ((err as { code?: string }).code !== '-5') {
        setGeneralError('Google sign in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }, []);

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
          <Text style={styles.heading}>Welcome back</Text>

          <View style={styles.form}>
            <PillInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={emailError}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <PillInput
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              error={passwordError}
              password
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => router.push('/(auth)/forgot')}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {generalError ? (
            <Text style={styles.generalError}>{generalError}</Text>
          ) : null}

          <PillButton
            label="Log in"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            style={styles.primaryBtn}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <PillButton
            label="Continue with Google"
            onPress={handleGoogle}
            variant="secondary"
            loading={googleLoading}
            fullWidth
            icon={<Ionicons name="logo-google" size={18} color={colors.text} />}
          />

          <TouchableOpacity
            style={styles.signupLink}
            onPress={() => router.replace('/(auth)/signup')}
          >
            <Text style={styles.signupLinkText}>
              No account? <Text style={styles.signupLinkAccent}>Sign up</Text>
            </Text>
          </TouchableOpacity>
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
  form: { gap: spacing.md },
  forgotLink: { alignSelf: 'flex-end' },
  forgotText: { fontSize: fontSize.sm, color: colors.accent },
  generalError: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  primaryBtn: { marginTop: spacing.xs },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSize.sm, color: colors.muted },
  signupLink: { alignItems: 'center', marginTop: spacing.sm },
  signupLinkText: { fontSize: fontSize.sm, color: colors.muted },
  signupLinkAccent: { color: colors.accent, fontWeight: '600' },
});
