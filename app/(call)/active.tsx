import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Animated,
  PanResponder,
  useWindowDimensions,
  Modal,
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
import {
  startRingbackTone,
  stopRingbackTone,
  playPickupChime,
  playCutBeep,
  playNetworkWarningBeep,
  stopAllCallSounds,
  hapticPickup,
  hapticCallCut,
  hapticWheelTick,
} from '@/lib/callSounds';

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
  const [audioBlocked, setAudioBlocked] = React.useState(false);

  React.useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    el.muted = false;
    el.volume = 1.0;

    const playAudio = () => {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play()
        .then(() => {
          setAudioBlocked(false);
        })
        .catch((err) => {
          console.warn('[WebRTC AudioWeb] Autoplay blocked, waiting for user gesture:', err);
          setAudioBlocked(true);
          const unlock = () => {
            el.play()
              .then(() => setAudioBlocked(false))
              .catch(() => {});
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
          };
          window.addEventListener('click', unlock, { once: true });
          window.addEventListener('touchstart', unlock, { once: true });
          window.addEventListener('pointerdown', unlock, { once: true });
          window.addEventListener('keydown', unlock, { once: true });
        });
    };

    playAudio();

    const handleTrackAdded = (e: any) => {
      if (e.track?.kind === 'audio') {
        el.srcObject = null;
        el.srcObject = stream;
      }
      playAudio();
    };

    if (typeof stream.addEventListener === 'function') {
      stream.addEventListener('addtrack', handleTrackAdded);
      stream.addEventListener('removetrack', playAudio);
      return () => {
        stream.removeEventListener('addtrack', handleTrackAdded);
        stream.removeEventListener('removetrack', playAudio);
      };
    }
  }, [stream]);

  if (Platform.OS !== 'web') return null;

  return (
    <>
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        style={{
          position: 'fixed',
          top: -10000,
          left: -10000,
          width: 1,
          height: 1,
          opacity: 0.001,
          pointerEvents: 'none',
        }}
      />
      {audioBlocked && (
        <TouchableOpacity
          style={styles.unmutePill}
          onPress={() => {
            if (audioRef.current) {
              audioRef.current.play().then(() => setAudioBlocked(false)).catch(() => {});
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="volume-high" size={16} color="#FFFFFF" />
          <Text style={styles.unmuteText}>Tap anywhere to enable audio</Text>
        </TouchableOpacity>
      )}
    </>
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

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const isVideo = video === 'true' || false;
  const durationSecNum = parseInt(durationSec ?? '300', 10);

  // Hooks
  const { room, serverOffset, endCall } = useCallRoom(roomId ?? null, user?.uid ?? null);
  const resolvedIsVideo = isVideo || room?.video === true;
  const media = useMedia(resolvedIsVideo, roomId ?? null, user?.uid ?? null);
  const releaseMediaRef = React.useRef(media.releaseMedia);
  releaseMediaRef.current = media.releaseMedia;

  const isCallee = role === 'callee' || (room && user?.uid && room.calleeUid === user.uid);
  const isCaller = role ? role === 'caller' : room ? room.callerUid === user?.uid : false;

  // PiP swap state: if true, local stream is full-screen, remote stream is in PiP
  const [isPiPSwapped, setIsPiPSwapped] = useState(false);

  // Controls auto-hiding state (8s timeout)
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Microphone selection modal
  const [micModalOpen, setMicModalOpen] = useState(false);

  // Network loss states
  const [isNetworkUnstable, setIsNetworkUnstable] = useState(false);
  const [isNetworkLost, setIsNetworkLost] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkCutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PiP sizing animation
  const pipWidthAnim = useRef(new Animated.Value(120)).current;
  const pipHeightAnim = useRef(new Animated.Value(160)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(pipWidthAnim, {
        toValue: controlsVisible ? 120 : 88,
        duration: 220,
        useNativeDriver: false,
      }),
      Animated.timing(pipHeightAnim, {
        toValue: controlsVisible ? 160 : 117,
        duration: 220,
        useNativeDriver: false,
      }),
    ]).start();
  }, [controlsVisible, pipWidthAnim, pipHeightAnim]);

  // Controls auto-hide timer management
  const resetControlsTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 8000);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => !prev);
  }, []);

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (controlsVisible) {
      resetControlsTimer();
    } else if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
  }, [controlsVisible, controlsOpacity, resetControlsTimer]);

  // PiP PanResponder with edge snapping
  const pan = useRef(new Animated.ValueXY({ x: screenWidth - 120 - 16, y: 80 })).current;
  const currentPos = useRef({ x: screenWidth - 120 - 16, y: 80 });

  useEffect(() => {
    const initX = screenWidth - (controlsVisible ? 120 : 88) - 16;
    currentPos.current = { x: initX, y: 80 };
    pan.setValue({ x: initX, y: 80 });
  }, [screenWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          pan.setOffset({ x: currentPos.current.x, y: currentPos.current.y });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, gesture) => {
          pan.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          pan.flattenOffset();
          const finalX = currentPos.current.x + gesture.dx;
          const finalY = currentPos.current.y + gesture.dy;
          const curW = controlsVisible ? 120 : 88;
          const curH = controlsVisible ? 160 : 117;

          const isClick = Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6;
          if (isClick) {
            // Tap on PiP swaps fullscreen and PiP
            setIsPiPSwapped((v) => !v);
            hapticWheelTick();
            return;
          }

          // Edge snapping: snap to left (16px) or right (screenWidth - curW - 16px)
          const targetX =
            finalX + curW / 2 < screenWidth / 2
              ? 16
              : screenWidth - curW - 16;
          const targetY = Math.min(
            Math.max(finalY, 70),
            screenHeight - 160 - curH,
          );

          currentPos.current = { x: targetX, y: targetY };
          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            damping: 22,
            stiffness: 260,
            useNativeDriver: false,
          }).start();
        },
      }),
    [controlsVisible, screenWidth, screenHeight, pan],
  );

  const cleanIncomingIfCallee = useCallback(() => {
    if (user?.uid && isCallee) {
      deleteIncoming(user.uid).catch(() => {});
    }
  }, [user?.uid, isCallee]);

  const handleExpire = useCallback(() => {
    playCutBeep();
    hapticCallCut();
    stopAllCallSounds();
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

  const handleEndCall = useCallback(() => {
    playCutBeep();
    hapticCallCut();
    stopAllCallSounds();
    endCall(user?.uid ?? 'unknown');
    releaseMediaRef.current();
    cleanIncomingIfCallee();
    if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
    dismissOngoingCallNotification().catch(() => {});
    router.replace('/(main)/home');
  }, [endCall, cleanIncomingIfCallee, roomId]);

  const { muteAudio, muteVideo } = useSignaling({
    roomId: roomId!,
    room,
    role,
    myUid: user?.uid ?? '',
    isVideo: resolvedIsVideo,
    localStream: media.localStream,
    onRemoteStream: media.setRemote,
    onConnectionStateChange: (state) => {
      if (state === 'disconnected') {
        setIsNetworkUnstable(true);
        playNetworkWarningBeep();
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            setIsNetworkLost(true);
          }, 8000);
        }
      } else if (state === 'failed') {
        setIsNetworkLost(true);
      } else if (state === 'connected') {
        setIsNetworkUnstable(false);
        setIsNetworkLost(false);
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        if (networkCutTimerRef.current) {
          clearTimeout(networkCutTimerRef.current);
          networkCutTimerRef.current = null;
        }
      }
    },
    onEnd: () => {
      playCutBeep();
      hapticCallCut();
      stopAllCallSounds();
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
      router.replace('/(main)/home');
    },
  });

  // Outgoing ringback & pickup tone lifecycle
  useEffect(() => {
    if (room?.state === 'ringing' && isCaller) {
      startRingbackTone();
    } else {
      stopRingbackTone();
    }

    if (room?.state === 'active') {
      playPickupChime();
      hapticPickup();
    }
  }, [room?.state, isCaller]);

  // Watch for remote hang-up
  useEffect(() => {
    if (!room) return;
    if (room.state === 'ended' || room.state === 'declined' || room.state === 'cancelled') {
      playCutBeep();
      hapticCallCut();
      stopAllCallSounds();
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
      router.replace('/(main)/home');
    }
  }, [room?.state, cleanIncomingIfCallee, roomId]);

  // Network loss auto cut after 10s
  useEffect(() => {
    if (isNetworkLost && !networkCutTimerRef.current) {
      networkCutTimerRef.current = setTimeout(() => {
        handleEndCall();
      }, 10000);
    }
  }, [isNetworkLost, handleEndCall]);

  // Show ongoing notification when call becomes active
  useEffect(() => {
    if (room?.state === 'active' && Platform.OS !== 'web') {
      showOngoingCallNotification(contactName ?? '').catch(() => {});
    }
  }, [room?.state, contactName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllCallSounds();
      releaseMediaRef.current();
      cleanIncomingIfCallee();
      if (Platform.OS === 'android' && roomId) dismissCallNotification(roomId).catch(() => {});
      dismissOngoingCallNotification().catch(() => {});
    };
  }, [roomId, cleanIncomingIfCallee]);

  const handleMute = useCallback(() => {
    resetControlsTimer();
    media.toggleMic();
    muteAudio(!media.micMuted);
  }, [media, muteAudio, resetControlsTimer]);

  const handleCamToggle = useCallback(() => {
    resetControlsTimer();
    media.toggleCam();
    muteVideo(!media.camOff);
  }, [media, muteVideo, resetControlsTimer]);

  const handleSpeakerToggle = useCallback(() => {
    resetControlsTimer();
    media.toggleSpeaker();
  }, [media, resetControlsTimer]);

  const callState = room?.state ?? 'ringing';
  const isConnecting = callState === 'ringing';
  const isActive = callState === 'active';

  // Video streams mapping for WhatsApp style swap
  const bgStream = isPiPSwapped ? media.localStream : media.remoteStream;
  const bgMirror = isPiPSwapped ? media.isFrontCamera : false;

  const pipStream = isPiPSwapped ? media.remoteStream : media.localStream;
  const pipMirror = isPiPSwapped ? false : media.isFrontCamera;

  return (
    <View style={styles.fullscreen}>
      <RemoteAudioWeb stream={media.remoteStream} />

      {/* Tap background to toggle controls visibility */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill}>
          {/* Fullscreen Video / Avatar background */}
          {resolvedIsVideo && bgStream && VideoRenderer ? (
            <VideoRenderer
              key={`bg_${bgStream.id}_${bgStream.getVideoTracks?.()?.length ?? 0}`}
              streamURL={(bgStream as { toURL?: () => string }).toURL?.() ?? ''}
              stream={bgStream}
              mirror={bgMirror}
              objectFit="cover"
              zOrder={0}
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <View style={styles.audioBackground}>
              <Avatar name={contactName ?? ''} size={120} />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Draggable PiP Video Thumbnail (Video mode only) */}
      {resolvedIsVideo && pipStream && VideoRenderer && (
        <Animated.View
          style={[
            styles.pipContainer,
            {
              width: pipWidthAnim,
              height: pipHeightAnim,
              transform: pan.getTranslateTransform(),
            },
          ]}
          {...panResponder.panHandlers}
        >
          <VideoRenderer
            key={`pip_${pipStream.id}_${pipStream.getVideoTracks?.()?.length ?? 0}`}
            streamURL={(pipStream as { toURL?: () => string }).toURL?.() ?? ''}
            stream={pipStream}
            mirror={pipMirror}
            objectFit="cover"
            zOrder={1}
            style={styles.pipInner}
          />

          {/* Corner Flip Camera Button on PiP */}
          <Animated.View
            style={[styles.pipFlipBtnWrapper, { opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.pipFlipBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                resetControlsTimer();
                media.handleFlipCamera();
              }}
              accessibilityLabel="Flip camera"
              activeOpacity={0.8}
            >
              <Ionicons name="camera-reverse" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* Overlay UI (fades out with controlsVisible) */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <Animated.View
          style={[styles.topBar, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
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

          {/* Unstable connection badge */}
          {isNetworkUnstable && !isNetworkLost && (
            <View style={styles.unstablePill}>
              <Ionicons name="warning-outline" size={13} color="#FBBF24" />
              <Text style={styles.unstableText}>Poor network</Text>
            </View>
          )}
        </Animated.View>

        {/* Contact name (audio mode only) */}
        {!resolvedIsVideo && (
          <Animated.View
            style={{ opacity: controlsOpacity }}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <Text style={styles.contactNameText}>{contactName}</Text>
          </Animated.View>
        )}

        {/* Bottom controls */}
        <Animated.View
          style={[styles.controls, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          {/* Mic Button + Flyout Chevron */}
          <View style={styles.micBtnContainer}>
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
            {media.audioDevices.length > 0 && (
              <TouchableOpacity
                style={styles.micChevronBadge}
                onPress={() => {
                  resetControlsTimer();
                  setMicModalOpen(true);
                }}
                accessibilityLabel="Choose microphone"
              >
                <Ionicons name="chevron-up" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Speaker button */}
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={handleSpeakerToggle}
            accessibilityLabel={media.speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
          >
            <Ionicons
              name={media.speakerOn ? 'volume-high' : 'volume-medium'}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          {/* Video Toggle (video mode only) */}
          {resolvedIsVideo && (
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
          )}

          {/* End Call Button */}
          <TouchableOpacity
            style={[styles.controlBtn, styles.endBtn]}
            onPress={handleEndCall}
            accessibilityLabel="End call"
          >
            <Ionicons name="call" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* Microphone Selection Modal / Popover */}
      <Modal
        visible={micModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMicModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMicModalOpen(false)}>
          <View style={styles.micModalBackdrop}>
            <View style={styles.micModalCard}>
              <View style={styles.micModalHeader}>
                <Ionicons name="mic" size={18} color={colors.accent} />
                <Text style={styles.micModalTitle}>Select Microphone</Text>
              </View>
              {media.audioDevices.map((d) => {
                const isSelected = media.selectedAudioDeviceId === d.deviceId;
                return (
                  <TouchableOpacity
                    key={d.deviceId}
                    style={[styles.micRow, isSelected && styles.micRowActive]}
                    onPress={() => {
                      media.switchAudioDevice(d.deviceId);
                      setMicModalOpen(false);
                      resetControlsTimer();
                    }}
                  >
                    <Text
                      style={[styles.micLabel, isSelected && styles.micLabelActive]}
                      numberOfLines={1}
                    >
                      {d.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Network Lost Blurred Screen */}
      {isNetworkLost && (
        <View style={styles.networkLostOverlay}>
          <View style={styles.networkLostContent}>
            <View style={styles.wifiCrossCircle}>
              <Ionicons name="cloud-offline" size={56} color={colors.danger} />
            </View>
            <Text style={styles.networkLostTitle}>Connection Lost</Text>
            <Text style={styles.networkLostSubtitle}>
              Unable to reach peer. Check your internet connection.
            </Text>
            <TouchableOpacity style={styles.networkEndBtn} onPress={handleEndCall}>
              <Ionicons name="call" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.networkEndBtnText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    zIndex: 2,
  },
  topBar: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: fontSize.sm, color: colors.muted },
  unstablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  unstableText: {
    fontSize: fontSize.xs,
    color: '#FBBF24',
    fontWeight: '600',
  },
  contactNameText: {
    textAlign: 'center',
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  pipContainer: {
    position: 'absolute',
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#000',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 12,
  },
  pipInner: {
    width: '100%',
    height: '100%',
  },
  pipFlipBtnWrapper: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 20,
  },
  pipFlipBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(14,14,17,0.78)',
    paddingTop: spacing.md,
  },
  micBtnContainer: {
    position: 'relative',
  },
  micChevronBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  unmutePill: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  unmuteText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  micModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    paddingBottom: 90,
    paddingHorizontal: spacing.md,
  },
  micModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  micModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  micModalTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  micRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  micLabel: {
    fontSize: fontSize.sm,
    color: colors.muted,
    flex: 1,
    marginRight: spacing.sm,
  },
  micLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  networkLostOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 14, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    paddingHorizontal: spacing.lg,
  },
  networkLostContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  wifiCrossCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  networkLostTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  networkLostSubtitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  networkEndBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  networkEndBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: fontSize.md,
  },
});
