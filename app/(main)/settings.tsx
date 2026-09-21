import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '@/ui/Wordmark';
import { PillInput } from '@/ui/PillInput';
import { PillButton } from '@/ui/PillButton';
import { CodeDisplay } from '@/ui/CodeDisplay';
import { useAuth } from '@/lib/useAuth';
import { getIdToken } from '@/firebase/auth';
import { colors, spacing, fontSize } from '@/theme/tokens';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export default function SettingsScreen() {
  const { user, userDoc, logout, refreshUserDoc } = useAuth();

  const [username, setUsername] = useState(userDoc?.username ?? '');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSaveUsername = useCallback(async () => {
    setUsernameError('');
    const trimmed = username.trim();
    if (trimmed.length < 2) { setUsernameError('At least 2 characters required'); return; }
    if (trimmed.length > 20) { setUsernameError('Maximum 20 characters'); return; }

    setUsernameSaving(true);
    try {
      const idToken = await getIdToken();
      const resp = await fetch(`${API_URL}/profile/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!data.ok) { setUsernameError(data.error ?? 'Failed to save'); return; }
      refreshUserDoc();
    } catch {
      setUsernameError('Network error. Try again.');
    } finally {
      setUsernameSaving(false);
    }
  }, [username, refreshUserDoc]);

  const handleRegenCode = useCallback(() => {
    Alert.alert(
      'Regenerate code',
      'Your old code will stop working. Current contacts stay connected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setRegenLoading(true);
            try {
              const idToken = await getIdToken();
              const resp = await fetch(`${API_URL}/profile/regenerate-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({}),
              });
              const data = await resp.json() as { ok: boolean; error?: string };
              if (data.ok) refreshUserDoc();
            } catch { /* ignore */ } finally {
              setRegenLoading(false);
            }
          },
        },
      ],
    );
  }, [refreshUserDoc]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await logout();
        },
      },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.back}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.muted} />
          </TouchableOpacity>
          <Wordmark />
        </View>

        <Text style={styles.heading}>Settings</Text>

        {/* Your code */}
        {userDoc?.code && (
          <View style={styles.section}>
            <CodeDisplay code={userDoc.code} />
          </View>
        )}

        {/* Username */}
        <View style={styles.section}>
          <PillInput
            label="Display name"
            value={username}
            onChangeText={setUsername}
            error={usernameError}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleSaveUsername}
          />
          <PillButton
            label="Save name"
            onPress={handleSaveUsername}
            variant="secondary"
            loading={usernameSaving}
            fullWidth
          />
        </View>

        {/* Regenerate code */}
        <View style={styles.section}>
          <PillButton
            label="Regenerate code"
            onPress={handleRegenCode}
            variant="secondary"
            loading={regenLoading}
            fullWidth
            icon={<Ionicons name="refresh-outline" size={18} color={colors.text} />}
          />
          <Text style={styles.hint}>
            Your contacts stay connected. Only new requests need your new code.
          </Text>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <PillButton
            label="Sign out"
            onPress={handleSignOut}
            variant="danger"
            loading={signingOut}
            fullWidth
          />
        </View>

        <Text style={styles.email}>{userDoc?.email ?? user?.email}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  back: { padding: spacing.xs },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  section: { gap: spacing.sm },
  hint: { fontSize: fontSize.xs, color: colors.muted, lineHeight: Math.round(fontSize.xs * 1.5) },
  email: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center' },
});
