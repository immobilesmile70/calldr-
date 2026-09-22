import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/ui/Avatar';
import { CountdownPill } from '@/ui/CountdownPill';
import { useAuth } from '@/lib/useAuth';
import { useCallRoom } from '@/calls/useCallRoom';
import { useCallTimer } from '@/calls/useTimer';
import { useMedia } from '@/calls/useMedia';
import { useSignaling } from '@/calls/useSignaling';
import {
  showOngoingCallNotification,
  dismissOngoingCallNotification,
  dismissCallNotification,
} from '@/notifications/notifee';
import { deleteIncoming } from '@/firebase/rtdb';
import { colors, spacing, fontSize, radii } from '@/theme/tokens';

// Platform-aware VideoRenderer
let VideoRenderer: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VideoRenderer = require('react-native-webrtc').RTCView;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VideoRenderer = require('@/webrtc/VideoRendererWeb').VideoRendererWeb;
}


function RemoteAudioWeb({ stream }: { stream: MediaStream | null }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    const el = audioRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch((err) => {
        console.warn('[WebRTC AudioWeb] Autoplay blocked, waiting for user click:', err);
        const unlock = () => {
          el.play().catch(() => {});
          window.removeEventListener('click', unlock);
          window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
      });
    }
  }, [stream]);

  if (Platform.OS !== 'web') return null;

  return (
    <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
  );
}

const LOCAL_PREVIEW_SIZE = 100;

export default function ActiveCallScreen() {
  const { user } = useAuth();
  const { roomId, contactName, video, durationSec, role } = useLocalSearchParams<{
    roomId: string;
    role: 'caller' | 'callee';
    contactName: string;
    video: string;
    durationSec: string;
  }>();

  const isVideo = video === 'true';
  const durationSecNum = parseInt(durationSec ?? '300', 10);

  // Hooks
  const { room, serverOffset, endCall } = useCallRoom(roomId ?? null, user?.uid ?? null);
  const media = useMedia(isVideo, roomId ?? null, user?.uid ?? null);
  const releaseMediaRef = React.useRef(media.releaseMedia);
  releaseMediaRef.current = media.releaseMedia;

  const isCallee = role === 'callee' || (room && user?.uid && room.calleeUid === user.uid);

  const cleanIncomingIfCallee = useCallback(() => {
    if (user?.uid && isCallee) {
      deleteIncoming(user.uid).catch(() => {});
    }
  }, [user?.uid, isCallee]);

  const handleExpire = useCallback(() => {
    endCall('timeout');
    releaseMediaRef.current();
    cleanIncomingIfCallee();
    if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
    dismissOngoingCallNotification().catch(() => {});
    router.replace('/(main)/home');
  }, [endCall, cleanIncomingIfCallee, roomId]);

  useCallTimer(
    room?.answeredAt,
    durationSecNum,
    serverOffset,
    handleExpire,
  );

  const { muteAudio, muteVideo } = useSignaling({
    roomId: roomId!,
    room,
    role,
    myUid: user?.uid ?? '',
    localStream: media.localStream,
    onRemoteStream: media.setRemote,
    onConnectionStateChange: (_state) => {},
    onEnd: () => {
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
      router.replace('/(main)/home');
    },
  });

  // Watch for remote hang-up
  useEffect(() => {
    if (!room) return;
    if (room.state === 'ended' || room.state === 'declined' || room.state === 'cancelled') {
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
      router.replace('/(main)/home');
    }
  }, [room?.state, cleanIncomingIfCallee, roomId]);

  // Show ongoing notification when call becomes active
  useEffect(() => {
    if (room?.state === 'active' && Platform.OS !== 'web') {
      showOngoingCallNotification(contactName ?? '').catch(() => {});
    }
  }, [room?.state, contactName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, cleanIncomingIfCallee]);

  const handleEndCall = useCallback(() => {
    endCall(user?.uid ?? 'unknown');
    releaseMediaRef.current();
    cleanIncomingIfCallee();
    if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
    dismissOngoingCallNotification().catch(() => {});
    router.replace('/(main)/home');
  }, [endCall, cleanIncomingIfCallee, roomId]);

  const handleMute = useCallback(() => {
    media.toggleMic();
    muteAudio(!media.micMuted);
  }, [media, muteAudio]);

  const handleCamToggle = useCallback(() => {
    media.toggleCam();
    muteVideo(!media.camOff);
  }, [media, muteVideo]);

  const callState = room?.state ?? 'ringing';
  const isConnecting = callState === 'ringing';
  const isActive = callState === 'active';

  return (
    <View style={styles.fullscreen}>
      <RemoteAudioWeb stream={media.remoteStream} />
      {/* Remote video / avatar background */}
      {isVideo && media.remoteStream && VideoRenderer ? (
        <VideoRenderer
          streamURL={(media.remoteStream as { toURL?: () => string }).toURL?.() ?? ''}
          stream={media.remoteStream}
          objectFit="cover"
          zOrder={0}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View style={styles.audioBackground}>
          <Avatar name={contactName ?? ''} size={120} />
        </View>
      )}

      {/* Overlay */}
      <SafeAreaView style={styles.overlay}>
        {/* Top: countdown + status */}
        <View style={styles.topBar}>
          {isActive && room?.answeredAt ? (
            <CountdownPill
              endsAtMs={room.answeredAt + durationSecNum * 1000}
              nowMs={Date.now() + serverOffset}
              contactName={contactName ?? ''}
            />
          ) : (
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {isConnecting ? 'Calling...' : 'Connected'}
              </Text>
            </View>
          )}
        </View>

        {/* Contact name (audio mode only — video shows avatar large) */}
        {!isVideo && (
          <Text style={styles.contactNameText}>{contactName}</Text>
        )}

        {/* Local preview (video only) — draggable placeholder */}
        {isVideo && media.localStream && VideoRenderer && (
          <View style={styles.localPreview}>
            <VideoRenderer
              streamURL={(media.localStream as { toURL?: () => string }).toURL?.() ?? ''}
              stream={media.localStream}
              mirror
              objectFit="cover"
              zOrder={1}
              style={styles.localPreviewInner}
            />
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={handleMute}
            accessibilityLabel={media.micMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <Ionicons
              name={media.micMuted ? 'mic-off' : 'mic'}
              size={24}
              color={media.micMuted ? colors.danger : colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={media.toggleSpeaker}
            accessibilityLabel={media.speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
          >
            <Ionicons
              name={media.speakerOn ? 'volume-high' : 'volume-medium'}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          {isVideo && (
            <>
              <TouchableOpacity
                style={styles.controlBtn}
                onPress={handleCamToggle}
                accessibilityLabel={media.camOff ? 'Turn camera on' : 'Turn camera off'}
              >
                <Ionicons
                  name={media.camOff ? 'videocam-off' : 'videocam'}
                  size={24}
                  color={media.camOff ? colors.danger : colors.text}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlBtn}
                onPress={media.handleFlipCamera}
                accessibilityLabel="Flip camera"
              >
                <Ionicons name="camera-reverse-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.controlBtn, styles.endBtn]}
            onPress={handleEndCall}
            accessibilityLabel="End call"
          >
            <Ionicons name="call" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  audioBackground: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: fontSize.sm, color: colors.muted },
  contactNameText: {
    textAlign: 'center',
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  localPreview: {
    position: 'absolute',
    top: 80,
    right: spacing.md,
    width: LOCAL_PREVIEW_SIZE,
    height: LOCAL_PREVIEW_SIZE * 1.33,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
  },
  localPreviewInner: {
    width: '100%',
    height: '100%',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(14,14,17,0.75)',
    paddingTop: spacing.md,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: {
    backgroundColor: colors.danger,
    width: 72,
  },
});
