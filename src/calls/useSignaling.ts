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
  room: CallRoom;
  myUid: string;
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
  myUid,
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
  const isCaller = room.callerUid === myUid;

  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const initPeer = useCallback(async () => {
    const idToken = await getIdToken();
    if (!idToken) return;

    const iceServers = await fetchIceServers(idToken);

    const pc = createPeerConnection({
      iceServers,
      onIceCandidate: async (candidateJson) => {
        const side = isCaller ? 'caller' : 'callee';
        await pushIceCandidate(roomId, side, candidateJson).catch(() => {});
      },
      onTrack: (stream) => {
        onRemoteStream(stream);
      },
      onConnectionStateChange: async (state) => {
        onConnectionStateChange(state);
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
          onEndRef.current('closed');
        }
      },
    });

    pcRef.current = pc;
    iceQueueRef.current = new IceCandidateQueue(pc);

    // Add local tracks
    if (localStream) {
      for (const track of localStream.getTracks()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pc.addTrack(track as any, localStream as any);
      }
    }

    if (isCaller) {
      // Caller creates offer
      const offer = await pc.createOffer({});
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

      // Callee: read offer, create answer
      if (!isCaller && updatedRoom.offer && !remotePc.remoteDescription) {
        const offerDesc = JSON.parse(updatedRoom.offer) as RTCSessionDescriptionInit;
        await remotePc.setRemoteDescription(offerDesc);
        await queue.flush();
        const answer = await remotePc.createAnswer();
        await remotePc.setLocalDescription(answer);
        await writeAnswer(roomId, JSON.stringify(answer));
        await setCallState(roomId, 'active');
        await applyBitrateConstraints(remotePc, updatedRoom.video);
      }

      // Caller: read answer
      if (isCaller && updatedRoom.answer && !remotePc.remoteDescription) {
        const answerDesc = JSON.parse(updatedRoom.answer) as RTCSessionDescriptionInit;
        await remotePc.setRemoteDescription(answerDesc);
        await queue.flush();
        await applyBitrateConstraints(remotePc, updatedRoom.video);
      }

      // Both sides: process new ICE candidates
      const mySide = isCaller ? 'callee' : 'caller'; // receive other side's ICE
      const iceData = updatedRoom.ice?.[mySide as 'caller' | 'callee'];
      if (iceData) {
        for (const candidateJson of Object.values(iceData)) {
          await queue.add(candidateJson as string).catch(() => {});
        }
      }

      // ICE restart: callee receives new offer (iceGen bumped)
      if (!isCaller && updatedRoom.iceGen !== undefined && updatedRoom.iceGen > iceGenRef.current) {
        iceGenRef.current = updatedRoom.iceGen;
        if (updatedRoom.offer && remotePc.remoteDescription) {
          const newOffer = JSON.parse(updatedRoom.offer) as RTCSessionDescriptionInit;
          await remotePc.setRemoteDescription(newOffer);
          const newAnswer = await remotePc.createAnswer();
          await remotePc.setLocalDescription(newAnswer);
          await writeAnswer(roomId, JSON.stringify(newAnswer));
        }
      }
    });

    return unwatch;
  }, [roomId, isCaller, localStream, onRemoteStream, onConnectionStateChange]);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    initPeer().then((u) => { unwatch = u; }).catch(() => {});

    return () => {
      unwatch?.();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pcRef.current) {
        pcRef.current.close();
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
