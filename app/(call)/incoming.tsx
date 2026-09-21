import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/ui/Avatar';
import { PillButton } from '@/ui/PillButton';
import { Wordmark } from '@/ui/Wordmark';
import { setCallState, deleteIncoming } from '@/firebase/rtdb';
import { useAuth } from '@/lib/useAuth';
import { colors, spacing, fontSize, radii } from '@/theme/tokens';

export default function IncomingCallScreen() {
  const { user } = useAuth();
  const { roomId, callerName, video, durationSec } = useLocalSearchParams<{
    roomId: string;
    callerName: string;
    video: string;
    durationSec: string;
  }>();

  const isVideo = video === 'true';
  const durationMin = Math.round(parseInt(durationSec ?? '300', 10) / 60);
  const modeLabel = isVideo ? 'Video' : 'Audio';

  const handleAccept = useCallback(() => {
    router.replace({
      pathname: '/(call)/active',
      params: {
        roomId,
        role: 'callee',
        contactName: callerName,
        video,
        durationSec,
      },
    });
  }, [roomId, callerName, video, durationSec]);

  const handleDecline = useCallback(async () => {
    try {
      await setCallState(roomId!, 'declined', { endedBy: user?.uid });
      if (user?.uid) await deleteIncoming(user.uid);
    } catch { /* ignore */ }
    router.replace('/(main)/home');
  }, [roomId, user?.uid]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Wordmark style={styles.wordmark} />

        {/* Caller info */}
        <View style={styles.callerSection}>
          <Avatar name={callerName ?? ''} size={88} />
          <Text style={styles.callerName}>{callerName}</Text>
          <View style={styles.modeBadge}>
            <Ionicons
              name={isVideo ? 'videocam-outline' : 'mic-outline'}
              size={16}
              color={colors.muted}
            />
            <Text style={styles.modeText}>
              {modeLabel} - {durationMin} min
            </Text>
          </View>
        </View>

        {/* Accept / Decline */}
        <View style={styles.actions}>
          <PillButton
            label="Accept"
            onPress={handleAccept}
            variant="success"
            fullWidth
            icon={<Ionicons name="call" size={20} color="#FFFFFF" />}
          />
          <PillButton
            label="Decline"
            onPress={handleDecline}
            variant="danger"
            fullWidth
            icon={<Ionicons name="call" size={20} color="#FFFFFF" />}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  wordmark: { paddingTop: spacing.md },
  callerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  callerName: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  modeText: { fontSize: fontSize.sm, color: colors.muted },
  actions: { gap: spacing.md },
});
