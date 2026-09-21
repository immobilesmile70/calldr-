/**
 * WebRTC peer connection manager.
 *
 * Handles:
 * - Creating RTCPeerConnection with ICE servers from /api/calls/ice
 * - Offer/answer creation and SDP exchange
 * - ICE candidate queuing (trickle ICE — queue until remote desc is set)
 * - ICE restart on disconnection/failure
 * - Sender bitrate constraints (video ~600kbps, Opus DTX/FEC)
 * - Media track management
 */
import { Platform } from 'react-native';

// Platform-resolved imports (metro resolves .native.ts / .web.ts)
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from './index';

const API_URL =
  Platform.OS === 'web'
    ? '/api'
    : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export async function fetchIceServers(idToken: string): Promise<IceServer[]> {
  const resp = await fetch(`${API_URL}/calls/ice`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!resp.ok) {
    console.warn('[WebRTC] Failed to fetch ICE servers, falling back to Google STUN');
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  const data = await resp.json() as { data: { iceServers: IceServer[] } };
  return data.data.iceServers;
}

// ── Peer connection factory ───────────────────────────────────────────────────

export type OnIceCandidate = (candidate: string) => void;
export type OnTrack = (stream: MediaStream) => void;
export type OnConnectionStateChange = (state: RTCPeerConnectionState) => void;

export interface PeerOptions {
  iceServers: IceServer[];
  onIceCandidate: OnIceCandidate;
  onTrack: OnTrack;
  onConnectionStateChange: OnConnectionStateChange;
}

export function createPeerConnection(opts: PeerOptions): RTCPeerConnection {
  const pc = new RTCPeerConnection({
    iceServers: opts.iceServers as RTCIceServer[],
    iceCandidatePoolSize: 10,
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      opts.onIceCandidate(JSON.stringify(event.candidate));
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) opts.onTrack(stream);
  };

  pc.onconnectionstatechange = () => {
    opts.onConnectionStateChange(pc.connectionState);
  };

  return pc;
}

// ── ICE candidate queue ───────────────────────────────────────────────────────

export class IceCandidateQueue {
  private queue: RTCIceCandidate[] = [];
  private remoteDescSet = false;
  private pc: RTCPeerConnection;

  constructor(pc: RTCPeerConnection) {
    this.pc = pc;
  }

  async add(candidateJson: string): Promise<void> {
    const candidate = new RTCIceCandidate(JSON.parse(candidateJson) as RTCIceCandidateInit);
    if (this.remoteDescSet) {
      await this.pc.addIceCandidate(candidate);
    } else {
      this.queue.push(candidate);
    }
  }

  async flush(): Promise<void> {
    this.remoteDescSet = true;
    for (const candidate of this.queue) {
      await this.pc.addIceCandidate(candidate);
    }
    this.queue = [];
  }
}

// ── Bitrate constraints ───────────────────────────────────────────────────────

const VIDEO_MAX_BITRATE_BPS = 600_000; // ~600kbps

export async function applyBitrateConstraints(
  pc: RTCPeerConnection,
  video: boolean,
): Promise<void> {
  if (!pc.getSenders) return;
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (!sender.track) continue;
    if (video && sender.track.kind === 'video') {
      const params = sender.getParameters ? sender.getParameters() : {} as RTCRtpSendParameters;
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0]!.maxBitrate = VIDEO_MAX_BITRATE_BPS;
      try {
        await sender.setParameters(params);
      } catch {
        // Not supported on all platforms — silently ignore
      }
    }
    if (sender.track.kind === 'audio') {
      // Opus DTX + FEC are typically set in the SDP offer/answer
      // Additional constraints can be set via setParameters if supported
    }
  }
}

// ── ICE restart ───────────────────────────────────────────────────────────────

export async function performIceRestart(
  pc: RTCPeerConnection,
): Promise<string> {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  return JSON.stringify(offer);
}
