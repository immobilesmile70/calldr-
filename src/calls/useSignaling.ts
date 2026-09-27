import { useEffect, useRef, useCallback } from 'react';
import {
  watchCallRoom,
  writeOffer,
  writeAnswer,
  pushIceCandidate,
  setCallState,
} from '@/firebase/rtdb';
import {
  createPeerConnection,
  IceCandidateQueue,
  fetchIceServers,
  applyBitrateConstraints,
  performIceRestart,
} from '@/webrtc/peer';
import { getIdToken } from '@/firebase/auth';
import { CallRoom } from '@shared/types';

const RECONNECT_TIMEOUT_MS = 15_000;
const RING_TIMEOUT_MS = 30_000;

export interface SignalingOptions {
  roomId: string;
  room: CallRoom | null;
  role?: 'caller' | 'callee';
  myUid: string;
  isVideo?: boolean;
  localStream: MediaStream | null;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onEnd: (reason: string) => void;
}

/**
 * Manages WebRTC signaling via RTDB:
 * - Caller creates offer, watches for answer
 * - Callee reads offer, creates answer
 * - Both sides trickle ICE via RTDB
 * - ICE restart on disconnect/fail
 * - 30s ring timeout (caller only)
 */
export function useSignaling({
  roomId,
  room,
  role,
  myUid,
  isVideo,
  localStream,
  onRemoteStream,
  onConnectionStateChange,
  onEnd,
}: SignalingOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcRef = useRef<any>(null);
  const iceQueueRef = useRef<IceCandidateQueue | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceGenRef = useRef<number>(0);
  const isClosingRef = useRef(false);
  const isCaller = role ? role === 'caller' : room ? room.callerUid === myUid : false;

  const onRemoteStreamRef = useRef(onRemoteStream);
  onRemoteStreamRef.current = onRemoteStream;
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  onConnectionStateChangeRef.current = onConnectionStateChange;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  const hasProcessedOfferRef = useRef(false);
  const hasProcessedAnswerRef = useRef(false);
  const isProcessingOfferRef = useRef(false);
  const isProcessingAnswerRef = useRef(false);
  const processedIceKeysRef = useRef<Set<string>>(new Set());

  const addTracksToPc = useCallback((targetPc: any, stream: MediaStream | null) => {
    if (!targetPc || !stream) return;
    try {
      const currentTracks = stream.getTracks();
      const senders = typeof targetPc.getSenders === 'function' ? targetPc.getSenders() : [];

      for (const track of currentTracks) {
        // 1. If we already have a sender for this exact track, nothing to do
        const exactSender = senders.find((s: any) => s?.track && s.track.id === track.id);
        if (exactSender) continue;

        // 2. If we have an existing sender of the same kind, replace its track (camera flip, mic switch)
        const sameKindSender = senders.find(
          (s: any) => s?.track && s.track.kind === track.kind
        );
        if (sameKindSender && typeof sameKindSender.replaceTrack === 'function') {
          sameKindSender.replaceTrack(track).catch?.(() => {});
          continue;
        }

        // 3. Otherwise add the track directly
        if (typeof targetPc.addTrack === 'function') {
          try {
            targetPc.addTrack(track as any, stream as any);
          } catch (err) {
            console.warn('[WebRTC] addTrack fallback warning:', err);
          }
        }
      }
    } catch (err) {
      console.warn('[WebRTC] addTracksToPc error:', err);
    }
  }, []);

  const initPeer = useCallback(async () => {
    if (!roomId) return;

    let idToken = await getIdToken().catch(() => null);
    if (!idToken) {
      for (let i = 0; i < 3 && !idToken; i++) {
        await new Promise((r) => setTimeout(r, 200));
        idToken = await getIdToken().catch(() => null);
      }
    }

    hasProcessedOfferRef.current = false;
    hasProcessedAnswerRef.current = false;
    isProcessingOfferRef.current = false;
    isProcessingAnswerRef.current = false;
    processedIceKeysRef.current = new Set();

    const iceServers = await fetchIceServers(idToken);

    const pc = createPeerConnection({
      iceServers,
      onIceCandidate: async (candidateJson) => {
        const side = isCaller ? 'caller' : 'callee';
        await pushIceCandidate(roomId, side, candidateJson).catch(() => {});
      },
      onTrack: (stream) => {
        onRemoteStreamRef.current(stream);
      },
      onConnectionStateChange: async (state) => {
        onConnectionStateChangeRef.current(state);
        if (state === 'disconnected' || state === 'failed') {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            onEndRef.current('connection_timeout');
          }, RECONNECT_TIMEOUT_MS);

          if (isCaller && state === 'failed') {
            // ICE restart
            try {
              iceGenRef.current++;
              const offerJson = await performIceRestart(pc);
              await writeOffer(roomId, offerJson);
            } catch {
              // ignore
            }
          }
        } else if (state === 'connected') {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        } else if (state === 'closed') {
          if (!isClosingRef.current) {
            onEndRef.current('closed');
          }
        }
      },
    });

    pcRef.current = pc;
    iceQueueRef.current = new IceCandidateQueue(pc);

    const waitForLocalStream = async (timeoutMs = 10000): Promise<MediaStream | null> => {
      if (localStreamRef.current) return localStreamRef.current;
      const start = Date.now();
      while (!localStreamRef.current && Date.now() - start < timeoutMs) {
        if (isClosingRef.current) return null;
        await new Promise((r) => setTimeout(r, 100));
      }
      return localStreamRef.current;
    };

    const isVideoCall = isVideo !== undefined ? isVideo : (room?.video ?? false);

    if (isCaller) {
      // Caller waits for localStream so offer contains audio/video tracks
      const stream = await waitForLocalStream(10000);
      if (isClosingRef.current || !pcRef.current) return;
      if (stream) {
        addTracksToPc(pc, stream);
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideoCall,
      });
      await pc.setLocalDescription(offer);
      await writeOffer(roomId, JSON.stringify(offer));

      // Ring timeout: if still ringing after 30s, cancel
      setTimeout(async () => {
        if (pcRef.current) {
          const state = pcRef.current.connectionState;
          if (state !== 'connected') {
            await setCallState(roomId, 'missed', { endedBy: 'timeout' }).catch(() => {});
            onEndRef.current('ring_timeout');
          }
        }
      }, RING_TIMEOUT_MS);
    }

    // Watch RTDB for signaling updates
    const unwatch = watchCallRoom(roomId, async (updatedRoom) => {
      if (!updatedRoom || !pcRef.current) return;
      const remotePc = pcRef.current;
      const queue = iceQueueRef.current!;

      // 1. Process and enqueue all new incoming ICE candidates FIRST
      const mySide = isCaller ? 'callee' : 'caller'; // receive other side's ICE
      const iceData = updatedRoom.ice?.[mySide as 'caller' | 'callee'];
      if (iceData && typeof iceData === 'object') {
        for (const [key, candidateJson] of Object.entries(iceData)) {
          if (processedIceKeysRef.current.has(key)) continue;
          processedIceKeysRef.current.add(key);
          await queue.add(candidateJson as string).catch(() => {});
        }
      }

      // 2. Callee: attach local tracks, read offer, set remote desc, create answer, set local desc, flush ICE!
      if (
        !isCaller &&
        updatedRoom.offer &&
        !hasProcessedOfferRef.current &&
        !isProcessingOfferRef.current
      ) {
        if (remotePc.signalingState !== 'stable') {
          return;
        }
        isProcessingOfferRef.current = true;
        try {
          if (remotePc.signalingState === 'stable') {
            const offerDesc = JSON.parse(updatedRoom.offer) as RTCSessionDescriptionInit;
            console.log('[WebRTC] Callee setting remote offer SDP');
            await remotePc.setRemoteDescription(offerDesc);
            hasProcessedOfferRef.current = true;

            const stream = await waitForLocalStream(10000);
            if (isClosingRef.current || !pcRef.current) return;
            if (stream) {
              addTracksToPc(remotePc, stream);
            }

            console.log('[WebRTC] Callee creating answer');
            const answer = await remotePc.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: isVideoCall,
            });
            await remotePc.setLocalDescription(answer);

            // Flush queued ICE candidates AFTER both remote and local descriptions are established!
            await queue.flush();

            await writeAnswer(roomId, JSON.stringify(answer));
            console.log('[WebRTC] Callee wrote answer, setting state to active');
            await setCallState(roomId, 'active');
            await applyBitrateConstraints(remotePc, updatedRoom.video);
          }
        } catch (err: any) {
          if (err?.name === 'InvalidStateError' || err?.message?.includes('Called in wrong state')) {
            console.warn('[WebRTC] Offer setRemoteDescription skipped due to state:', remotePc.signalingState);
          } else {
            console.error('[WebRTC] Failed to handle offer:', err);
          }
        } finally {
          isProcessingOfferRef.current = false;
        }
      }

      // 3. Caller: read answer
      if (
        isCaller &&
        updatedRoom.answer &&
        !hasProcessedAnswerRef.current &&
        !isProcessingAnswerRef.current
      ) {
        if (remotePc.signalingState !== 'have-local-offer') {
          return;
        }
        isProcessingAnswerRef.current = true;
        try {
          const answerDesc = JSON.parse(updatedRoom.answer) as RTCSessionDescriptionInit;
          if (remotePc.signalingState === 'have-local-offer') {
            console.log('[WebRTC] Caller setting remote answer SDP');
            await remotePc.setRemoteDescription(answerDesc);
            hasProcessedAnswerRef.current = true;
            await queue.flush();
            await applyBitrateConstraints(remotePc, updatedRoom.video);
            console.log('[WebRTC] Caller remote answer set successfully');
          }
        } catch (err: any) {
          if (err?.name === 'InvalidStateError' || err?.message?.includes('Called in wrong state')) {
            console.warn('[WebRTC] Answer setRemoteDescription skipped due to state:', remotePc.signalingState);
          } else {
            console.error('[WebRTC] Failed to set remote answer:', err);
          }
        } finally {
          isProcessingAnswerRef.current = false;
        }
      }

      // ICE restart: callee receives new offer (iceGen bumped)
      if (!isCaller && updatedRoom.iceGen !== undefined && updatedRoom.iceGen > iceGenRef.current) {
        iceGenRef.current = updatedRoom.iceGen;
        if (updatedRoom.offer && remotePc.remoteDescription && remotePc.signalingState === 'stable') {
          try {
            const newOffer = JSON.parse(updatedRoom.offer) as RTCSessionDescriptionInit;
            await remotePc.setRemoteDescription(newOffer);
            const newAnswer = await remotePc.createAnswer();
            await remotePc.setLocalDescription(newAnswer);
            await queue.flush();
            await writeAnswer(roomId, JSON.stringify(newAnswer));
          } catch (err) {
            console.warn('[WebRTC] ICE restart failed:', err);
          }
        }
      }
    });

    return unwatch;
  }, [roomId, isCaller, isVideo, addTracksToPc]);

  // Sync local tracks into peer connection whenever localStream changes
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    // Callee must wait until remote offer has been processed before adding tracks
    if (!isCaller && !hasProcessedOfferRef.current) return;
    addTracksToPc(pc, localStream);
  }, [localStream, isCaller, addTracksToPc]);

  useEffect(() => {
    isClosingRef.current = false;
    let unwatch: (() => void) | undefined;
    initPeer().then((u) => { unwatch = u; }).catch(() => {});

    return () => {
      isClosingRef.current = true;
      unwatch?.();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
        pcRef.current = null;
      }
    };
  }, [initPeer]);

  const muteAudio = useCallback((muted: boolean) => {
    const pc = pcRef.current;
    if (!pc) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pc.getSenders().forEach((s: any) => {
      if (s.track?.kind === 'audio') s.track.enabled = !muted;
    });
  }, []);

  const muteVideo = useCallback((muted: boolean) => {
    const pc = pcRef.current;
    if (!pc) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pc.getSenders().forEach((s: any) => {
      if (s.track?.kind === 'video') s.track.enabled = !muted;
    });
  }, []);

  return { muteAudio, muteVideo };
}
