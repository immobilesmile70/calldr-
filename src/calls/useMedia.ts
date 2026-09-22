import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { getLocalStream, flipCamera } from '@/webrtc/index';
import { setMediaFlags } from '@/firebase/rtdb';
import * as KeepAwake from 'expo-keep-awake';

// InCallManager is native-only
let InCallManager: {
  start: (o: { media: string }) => void;
  stop: () => void;
  setForceSpeakerphoneOn: (on: boolean) => void;
  setSpeakerphoneOn: (on: boolean) => void;
  setMicrophoneMute: (muted: boolean) => void;
} | null = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  InCallManager = require('react-native-incall-manager').default;
}

export interface MediaState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  camOff: boolean;
  speakerOn: boolean;
  permissionDenied: boolean;
  ready: boolean;
}

/**
 * Manages local media (camera/mic), in-call audio routing, and keep-awake.
 * Pauses local video when app is backgrounded (audio continues).
 */
export function useMedia(
  video: boolean,
  roomId: string | null,
  myUid: string | null,
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(video); // speaker on for video, earpiece for audio
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isKeepAwakeActiveRef = useRef(false);

  const safeDeactivateKeepAwake = useCallback(async () => {
    if (!isKeepAwakeActiveRef.current) return;
    isKeepAwakeActiveRef.current = false;
    try {
      await KeepAwake.deactivateKeepAwake();
    } catch {
      // ignore wake lock errors if not active or unsupported
    }
  }, []);

  // Acquire media
  useEffect(() => {
    let stream: MediaStream | null = null;

    const acquire = async () => {
      try {
        stream = await getLocalStream(video);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setReady(true);

        // Start in-call manager
        InCallManager?.start({ media: video ? 'video' : 'audio' });
        InCallManager?.setSpeakerphoneOn(video);
      } catch (err) {
        console.error('[Media] getUserMedia failed', err);
        setPermissionDenied(true);
        setReady(true);
      }
    };

    acquire();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      InCallManager?.stop();
    };
  }, [video]);

  // Keep awake during call
  useEffect(() => {
    let cancelled = false;
    KeepAwake.activateKeepAwakeAsync()
      .then(() => {
        if (cancelled) {
          try {
            KeepAwake.deactivateKeepAwake().catch?.(() => {});
          } catch {
            // ignore
          }
        } else {
          isKeepAwakeActiveRef.current = true;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      safeDeactivateKeepAwake();
    };
  }, [safeDeactivateKeepAwake]);

  // Pause local video when backgrounded
  useEffect(() => {
    if (!video || Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', (state) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      stream.getVideoTracks().forEach((t) => {
        t.enabled = state === 'active';
      });
    });

    return () => sub.remove();
  }, [video]);

  // Sync media flags to RTDB
  useEffect(() => {
    if (!roomId || !myUid) return;
    setMediaFlags(roomId, myUid, !micMuted, !camOff && video).catch(() => {});
  }, [micMuted, camOff, roomId, myUid, video]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !micMuted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    InCallManager?.setMicrophoneMute(newMuted);
    setMicMuted(newMuted);
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !video) return;
    const newOff = !camOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !newOff; });
    setCamOff(newOff);
  }, [camOff, video]);

  const toggleSpeaker = useCallback(() => {
    const newSpeaker = !speakerOn;
    InCallManager?.setForceSpeakerphoneOn(newSpeaker);
    setSpeakerOn(newSpeaker);
  }, [speakerOn]);

  const handleFlipCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) flipCamera(stream).catch(() => {});
  }, []);

  const [, setTrackVer] = useState(0);

  const setRemote = useCallback((stream: MediaStream) => {
    setRemoteStream(stream);
    if (stream && typeof (stream as any).addEventListener === 'function') {
      const handleTrackChange = () => {
        setTrackVer((v) => v + 1);
      };
      (stream as any).addEventListener('addtrack', handleTrackChange);
      (stream as any).addEventListener('removetrack', handleTrackChange);
    }
  }, []);

  const releaseMedia = useCallback(() => {
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    InCallManager?.stop();
    safeDeactivateKeepAwake();
  }, [safeDeactivateKeepAwake]);

  return {
    localStream,
    remoteStream,
    micMuted,
    camOff,
    speakerOn,
    permissionDenied,
    ready,
    toggleMic,
    toggleCam,
    toggleSpeaker,
    handleFlipCamera,
    setRemote,
    releaseMedia,
  };
}
