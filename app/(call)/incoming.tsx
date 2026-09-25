import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/ui/Avatar';
import { PillButton } from '@/ui/PillButton';
import { Wordmark } from '@/ui/Wordmark';
import { setCallState, deleteIncoming, watchCallRoom } from '@/firebase/rtdb';
import { dismissCallNotification } from '@/notifications/notifee';
import { useAuth } from '@/lib/useAuth';
import { colors, spacing, fontSize, radii } from '@/theme/tokens';

import {
  startIncomingRingtone,
  stopIncomingRingtone,
  hapticPickup,
  hapticCallCut,
} from '@/lib/callSounds';

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

  // Ringtone playback on mount
  useEffect(() => {
    startIncomingRingtone();
    return () => {
      stopIncomingRingtone();
    };
  }, []);

  // Watch for caller cancelling or call ending while ringing
  useEffect(() => {
    if (!roomId) return;
    const unwatch = watchCallRoom(roomId, (room) => {
      if (!room) return;
      if (
        room.state === 'cancelled' ||
        room.state === 'ended' ||
        room.state === 'missed' ||
        room.state === 'declined'
      ) {
        stopIncomingRingtone();
        if (user?.uid) {
          deleteIncoming(user.uid).catch(() => {});
        }
        if (Platform.OS === 'android') {
          dismissCallNotification(roomId).catch(() => {});
        }
        router.replace('/(main)/home');
      }
    });
    return () => {
      unwatch();
    };
  }, [roomId, user?.uid]);

  const handleAccept = useCallback(() => {
    stopIncomingRingtone();
    hapticPickup();
    if (user?.uid) {
      deleteIncoming(user.uid).catch(() => {});
    }
    if (Platform.OS === 'android' && roomId) {
      dismissCallNotification(roomId).catch(() => {});
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLOSE_CALL_NOTIFICATION',
        roomId,
      });
    }
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
  }, [roomId, callerName, video, durationSec, user?.uid]);

  const handleDecline = useCallback(async () => {
    stopIncomingRingtone();
    hapticCallCut();
    try {
      await setCallState(roomId!, 'declined', { endedBy: user?.uid });
    } catch { /* ignore */ }
    if (user?.uid) {
      await deleteIncoming(user.uid).catch(() => {});
    }
    if (Platform.OS === 'android' && roomId) {
      dismissCallNotification(roomId).catch(() => {});
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLOSE_CALL_NOTIFICATION',
        roomId,
      });
    }
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
