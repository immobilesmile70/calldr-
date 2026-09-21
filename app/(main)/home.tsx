import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '@/ui/Wordmark';
import { PillButton } from '@/ui/PillButton';
import { Avatar } from '@/ui/Avatar';
import { BottomSheet } from '@/ui/BottomSheet';
import { CodeDisplay } from '@/ui/CodeDisplay';
import { CodeInput } from '@/ui/CodeInput';
import { LoadingSkeleton } from '@/ui/LoadingSkeleton';
import { useAuth } from '@/lib/useAuth';
import { useConnections } from '@/lib/useConnections';
import { getIdToken } from '@/firebase/auth';
import { colors, spacing, fontSize, radii, PILL_HEIGHT } from '@/theme/tokens';
import { formatCode } from '@shared/code';
import { Contact, DURATION_OPTIONS, DurationMinutes } from '@shared/types';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export default function HomeScreen() {
  const { user, userDoc } = useAuth();
  const { contacts, pendingIncoming, loading } = useConnections(user?.uid ?? null);

  // Bottom sheet state
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [callSheetContact, setCallSheetContact] = useState<Contact | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Code sheet state
  const [requestCode, setRequestCode] = useState('');
  const [requestCodeRaw, setRequestCodeRaw] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);

  // Call sheet state
  const [selectedDuration, setSelectedDuration] = useState<DurationMinutes>(15);
  const [selectedMode, setSelectedMode] = useState<'audio' | 'video'>('audio');
  const [callLoading, setCallLoading] = useState(false);

  const filteredContacts = useMemo(
    () =>
      searchQuery
        ? contacts.filter((c) =>
            c.username.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : contacts,
    [contacts, searchQuery],
  );

  const isZeroState = contacts.length === 0 && pendingIncoming.length === 0;

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSendRequest = useCallback(async () => {
    if (!requestCodeRaw || requestCodeRaw.length !== 10) {
      setRequestError('Enter a valid 10-character code.');
      return;
    }
    setRequestError('');
    setRequestLoading(true);
    try {
      const idToken = await getIdToken();
      const resp = await fetch(`${API_URL}/connections/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code: requestCodeRaw }),
      });
      const data = await resp.json() as { ok: boolean; error?: string; code?: string };
      if (!data.ok) {
        setRequestError(data.error ?? 'Failed to send request.');
        return;
      }
      setCodeSheetOpen(false);
      setRequestCode('');
      setRequestCodeRaw('');
    } catch {
      setRequestError('Network error. Please try again.');
    } finally {
      setRequestLoading(false);
    }
  }, [requestCodeRaw]);

  const handleRespond = useCallback(
    async (connectionId: string, action: 'accept' | 'decline') => {
      try {
        const idToken = await getIdToken();
        await fetch(`${API_URL}/connections/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ connectionId, action }),
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleRemoveContact = useCallback((contact: Contact) => {
    Alert.alert(
      'Remove contact',
      `Remove ${contact.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const idToken = await getIdToken();
              await fetch(`${API_URL}/connections/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ connectionId: contact.connectionId }),
              });
            } catch { /* ignore */ }
          },
        },
      ],
    );
  }, []);

  const handleCall = useCallback(async () => {
    if (!callSheetContact) return;
    setCallLoading(true);
    try {
      const idToken = await getIdToken();
      const resp = await fetch(`${API_URL}/calls/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          calleeUid: callSheetContact.uid,
          durationSec: selectedDuration * 60,
          video: selectedMode === 'video',
        }),
      });
      const data = await resp.json() as { ok: boolean; data?: { roomId: string }; error?: string };
      if (!data.ok) {
        Alert.alert('Call failed', data.error ?? 'Could not start call. Try again.');
        return;
      }
      setCallSheetContact(null);
      router.push({
        pathname: '/(call)/active',
        params: {
          roomId: data.data!.roomId,
          role: 'caller',
          contactName: callSheetContact.username,
          video: String(selectedMode === 'video'),
          durationSec: String(selectedDuration * 60),
        },
      });
    } catch {
      Alert.alert('Network error', 'Check your connection and try again.');
    } finally {
      setCallLoading(false);
    }
  }, [callSheetContact, selectedDuration, selectedMode]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderContact = useCallback(
    ({ item }: { item: Contact }) => (
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => setCallSheetContact(item)}
        onLongPress={() => handleRemoveContact(item)}
        accessibilityLabel={`Call ${item.username}. Long press to remove.`}
        activeOpacity={0.7}
      >
        <Avatar name={item.username} size={44} />
        <Text style={styles.contactName}>{item.username}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </TouchableOpacity>
    ),
    [handleRemoveContact],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Wordmark style={styles.wordmark} />
          <View style={styles.skeletonGroup}>
            <LoadingSkeleton height={20} width="40%" />
            <LoadingSkeleton height={56} />
            <LoadingSkeleton height={56} />
            <LoadingSkeleton height={56} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Wordmark />
          {userDoc && (
            <Text style={styles.greeting}>Hey {userDoc.username || 'there'}</Text>
          )}
        </View>

        {/* Zero state */}
        {isZeroState ? (
          <View style={styles.zeroState}>
            {userDoc?.code ? (
              <>
                <CodeDisplay code={userDoc.code} />
                <Text style={styles.hint}>
                  Share your code and start connecting.
                </Text>
              </>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            keyExtractor={(c) => c.connectionId}
            renderItem={renderContact}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                {/* Pending requests */}
                {pendingIncoming.length > 0 && (
                  <View style={styles.requestsSection}>
                    <Text style={styles.sectionLabel}>Requests</Text>
                    {pendingIncoming.map((conn) => {
                      const fromUid = conn.requester;
                      const fromName = conn.names[fromUid] ?? 'Someone';
                      return (
                        <View key={conn.id} style={styles.requestRow}>
                          <Avatar name={fromName} size={40} />
                          <Text style={styles.requestName}>{fromName}</Text>
                          <View style={styles.requestActions}>
                            <TouchableOpacity
                              style={styles.acceptBtn}
                              onPress={() => handleRespond(conn.id, 'accept')}
                              accessibilityLabel={`Accept ${fromName}`}
                            >
                              <Ionicons name="checkmark" size={18} color={colors.success} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.declineBtn}
                              onPress={() => handleRespond(conn.id, 'decline')}
                              accessibilityLabel={`Decline ${fromName}`}
                            >
                              <Ionicons name="close" size={18} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    <View style={styles.divider} />
                  </View>
                )}

                {/* Search filter */}
                {searchOpen && (
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search contacts..."
                    placeholderTextColor={colors.muted}
                    autoFocus
                    accessibilityLabel="Search contacts"
                  />
                )}
              </>
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No contacts match your search.</Text>
            }
          />
        )}

        {/* Bottom pills */}
        <View style={styles.bottomBar}>
          {isZeroState ? (
            <>
              <PillButton
                label="Code"
                onPress={() => setCodeSheetOpen(true)}
                variant="secondary"
                icon={<Ionicons name="qr-code-outline" size={18} color={colors.text} />}
                style={styles.bottomPill}
              />
              <PillButton
                label="Settings"
                onPress={() => router.push('/(main)/settings')}
                variant="secondary"
                icon={<Ionicons name="settings-outline" size={18} color={colors.text} />}
                style={styles.bottomPill}
              />
            </>
          ) : (
            <>
              <PillButton
                label="Search"
                onPress={() => setSearchOpen((v) => !v)}
                variant="secondary"
                icon={<Ionicons name="search-outline" size={18} color={colors.text} />}
                style={styles.bottomPill}
              />
              <PillButton
                label="Code"
                onPress={() => setCodeSheetOpen(true)}
                variant="secondary"
                icon={<Ionicons name="qr-code-outline" size={18} color={colors.text} />}
                style={styles.bottomPill}
              />
              <PillButton
                label="Settings"
                onPress={() => router.push('/(main)/settings')}
                variant="secondary"
                icon={<Ionicons name="settings-outline" size={18} color={colors.text} />}
                style={styles.bottomPill}
              />
            </>
          )}
        </View>
      </View>

      {/* Code sheet */}
      <BottomSheet
        visible={codeSheetOpen}
        onClose={() => { setCodeSheetOpen(false); setRequestError(''); setRequestCode(''); setRequestCodeRaw(''); }}
      >
        <View style={styles.sheetContent}>
          {userDoc?.code ? <CodeDisplay code={userDoc.code} /> : null}
          <View style={styles.divider} />
          <Text style={styles.sheetLabel}>Add a contact</Text>
          <CodeInput
            value={requestCode}
            onChangeCode={(raw, formatted, _valid) => {
              setRequestCode(formatted);
              setRequestCodeRaw(raw);
              setRequestError('');
            }}
            error={requestError}
          />
          <PillButton
            label="Send request"
            onPress={handleSendRequest}
            loading={requestLoading}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Call sheet */}
      <BottomSheet
        visible={!!callSheetContact}
        onClose={() => setCallSheetContact(null)}
      >
        {callSheetContact && (
          <View style={styles.sheetContent}>
            <View style={styles.callSheetHeader}>
              <Avatar name={callSheetContact.username} size={52} />
              <Text style={styles.callContactName}>{callSheetContact.username}</Text>
            </View>

            <Text style={styles.sheetLabel}>Duration</Text>
            <View style={styles.pillRow}>
              {DURATION_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.optionPill, selectedDuration === d && styles.optionPillActive]}
                  onPress={() => setSelectedDuration(d)}
                  accessibilityLabel={`${d} minutes`}
                  accessibilityState={{ selected: selectedDuration === d }}
                >
                  <Text style={[styles.optionPillLabel, selectedDuration === d && styles.optionPillLabelActive]}>
                    {d}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sheetLabel}>Mode</Text>
            <View style={styles.pillRow}>
              {(['audio', 'video'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.optionPill, styles.optionPillWide, selectedMode === mode && styles.optionPillActive]}
                  onPress={() => setSelectedMode(mode)}
                  accessibilityLabel={mode === 'audio' ? 'Audio call' : 'Video call'}
                  accessibilityState={{ selected: selectedMode === mode }}
                >
                  <Ionicons
                    name={mode === 'audio' ? 'mic-outline' : 'videocam-outline'}
                    size={16}
                    color={selectedMode === mode ? '#FFFFFF' : colors.muted}
                  />
                  <Text style={[styles.optionPillLabel, selectedMode === mode && styles.optionPillLabelActive]}>
                    {mode === 'audio' ? 'Audio' : 'Video'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <PillButton
              label="Call"
              onPress={handleCall}
              loading={callLoading}
              fullWidth
              style={styles.callBtn}
            />
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: spacing.md },
  header: { paddingVertical: spacing.md, gap: spacing.xs },
  wordmark: {},
  greeting: { fontSize: fontSize.sm, color: colors.muted },
  zeroState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  hint: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center' },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  contactName: { flex: 1, fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  requestsSection: { gap: spacing.sm, marginBottom: spacing.md },
  sectionLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  requestName: { flex: 1, fontSize: fontSize.md, color: colors.text },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(52,211,153,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,77,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    height: PILL_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  emptyText: { color: colors.muted, textAlign: 'center', paddingTop: spacing.xl },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  bottomBar: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomPill: { flex: 1, paddingHorizontal: spacing.sm },
  sheetContent: { gap: spacing.md, paddingTop: spacing.sm },
  sheetLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  optionPillWide: { flex: 1, justifyContent: 'center' },
  optionPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionPillLabel: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '600' },
  optionPillLabelActive: { color: '#FFFFFF' },
  callBtn: { marginTop: spacing.sm },
  callSheetHeader: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  callContactName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  skeletonGroup: { gap: spacing.md, paddingTop: spacing.xl },
});
