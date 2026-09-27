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

import { hapticCameraSwitch } from '@/lib/callSounds';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

export interface MediaState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  camOff: boolean;
  speakerOn: boolean;
  permissionDenied: boolean;
  ready: boolean;
  isFrontCamera: boolean;
  audioDevices: AudioDeviceInfo[];
  selectedAudioDeviceId: string;
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
  const [speakerOn, setSpeakerOn] = useState(true); // default speakerphone on so call audio is audible without proximity sensor
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('default');
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

  // Enumerate audio input devices (web)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${i + 1}`,
          }));
        if (inputs.length > 0) {
          setAudioDevices(inputs);
        }
      } catch {
        // ignore
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices);
    };
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

        // Start in-call manager: use media: 'video' so Android audio defaults to SPEAKER_PHONE and prevents proximity sensor blackout
        InCallManager?.start({ media: 'video' });
        InCallManager?.setMicrophoneMute(false);
        if (typeof (InCallManager as any)?.chooseAudioRoute === 'function') {
          try {
            (InCallManager as any).chooseAudioRoute('SPEAKER_PHONE')?.catch?.(() => {});
          } catch {
            // ignore
          }
        }
        InCallManager?.setSpeakerphoneOn(true);
        InCallManager?.setForceSpeakerphoneOn(true);
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
    if (InCallManager) {
      if (typeof (InCallManager as any).chooseAudioRoute === 'function') {
        try {
          (InCallManager as any).chooseAudioRoute(newSpeaker ? 'SPEAKER_PHONE' : 'EARPIECE')?.catch?.(() => {});
        } catch {
          // ignore
        }
      }
      InCallManager.setForceSpeakerphoneOn(newSpeaker);
      InCallManager.setSpeakerphoneOn(newSpeaker);
    }
    setSpeakerOn(newSpeaker);
  }, [speakerOn]);

  const handleFlipCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      hapticCameraSwitch();
      setIsFrontCamera((prev) => !prev);
      flipCamera(stream).catch(() => {});
    }
  }, []);

  const [, setTrackVer] = useState(0);

  const switchAudioDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    const currentStream = localStreamRef.current;
    if (!currentStream) return;

    try {
      const newMedia = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const newTrack = newMedia.getAudioTracks()[0];
      if (!newTrack) return;

      const oldTrack = currentStream.getAudioTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        currentStream.removeTrack(oldTrack);
      }
      currentStream.addTrack(newTrack);
      setLocalStream(new MediaStream(currentStream.getTracks()));
      setMicMuted(false);
      setTrackVer((v) => v + 1);
    } catch (err) {
      console.warn('[useMedia] Failed to switch microphone:', err);
    }
  }, []);

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

  const ensureAudioRouting = useCallback(() => {
    if (Platform.OS !== 'web' && InCallManager) {
      try {
        InCallManager.start({ media: 'video' });
        InCallManager.setMicrophoneMute(false);
        if (typeof (InCallManager as any).chooseAudioRoute === 'function') {
          try {
            (InCallManager as any).chooseAudioRoute(speakerOn ? 'SPEAKER_PHONE' : 'EARPIECE')?.catch?.(() => {});
          } catch {
            // ignore
          }
        }
        InCallManager.setForceSpeakerphoneOn(speakerOn);
        InCallManager.setSpeakerphoneOn(speakerOn);
      } catch (err) {
        console.warn('[useMedia] ensureAudioRouting error:', err);
      }
    }
  }, [speakerOn]);

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
    isFrontCamera,
    audioDevices,
    selectedAudioDeviceId,
    switchAudioDevice,
    permissionDenied,
    ready,
    toggleMic,
    toggleCam,
    toggleSpeaker,
    handleFlipCamera,
    setRemote,
    releaseMedia,
    ensureAudioRouting,
  };
}
