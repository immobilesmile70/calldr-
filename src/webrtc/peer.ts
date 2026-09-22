/**
 * WebRTC peer connection manager.
 *
 * Intentionally uses `any` in places where react-native-webrtc types diverge
 * from browser WebRTC types. The runtime behaviour is correct on both platforms.
 */
import { Platform } from 'react-native';

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
  const fallbackServers: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];
  try {
    const resp = await fetch(`${API_URL}/calls/ice`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) {
      console.warn('[WebRTC] Failed to fetch ICE servers, falling back to Google STUN');
      return fallbackServers;
    }
    const data = (await resp.json()) as { data?: { iceServers?: IceServer[] } };
    return data?.data?.iceServers && data.data.iceServers.length > 0
      ? data.data.iceServers
      : fallbackServers;
  } catch (err) {
    console.warn('[WebRTC] Error fetching ICE servers, falling back to Google STUN:', err);
    return fallbackServers;
  }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPC = any;

export function createPeerConnection(opts: PeerOptions): AnyPC {
  // Platform-resolved at runtime — metro picks .native.ts or .web.ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RTCPeerConnection } = require('./index');

  const pc: AnyPC = new RTCPeerConnection({
    iceServers: opts.iceServers,
    iceCandidatePoolSize: 10,
  });

  let remoteStream: any = null;

  pc.onicecandidate = (event: AnyPC) => {
    if (event.candidate && event.candidate.candidate) {
      const c = event.candidate;
      const candidateInit = {
        candidate: c.candidate,
        sdpMid: c.sdpMid !== null && c.sdpMid !== undefined ? String(c.sdpMid) : '0',
        sdpMLineIndex: c.sdpMLineIndex !== null && c.sdpMLineIndex !== undefined ? Number(c.sdpMLineIndex) : 0,
        usernameFragment: c.usernameFragment || undefined,
      };
      console.log('[WebRTC] Local ICE candidate gathered:', candidateInit.candidate?.slice(0, 40));
      opts.onIceCandidate(JSON.stringify(candidateInit));
    }
  };

  pc.ontrack = (event: AnyPC) => {
    console.log('[WebRTC] ontrack event received. Has streams:', !!(event.streams && event.streams[0]), 'Track kind:', event.track?.kind);
    if (event.streams && event.streams[0]) {
      opts.onTrack(event.streams[0]);
      return;
    }
    if (event.track) {
      if (!remoteStream) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MediaStream } = require('./index');
        remoteStream = new MediaStream();
      }
      try {
        remoteStream.addTrack(event.track);
      } catch (err) {
        console.warn('[WebRTC] remoteStream.addTrack error:', err);
      }
      opts.onTrack(remoteStream);
    }
  };

  pc.oniceconnectionstatechange = () => {
    const iceState = pc.iceConnectionState;
    console.log('[WebRTC] ICE connection state changed:', iceState);
    if (iceState === 'connected' || iceState === 'completed') {
      opts.onConnectionStateChange('connected');
    } else if (iceState === 'failed') {
      opts.onConnectionStateChange('failed');
    } else if (iceState === 'disconnected') {
      opts.onConnectionStateChange('disconnected');
    }
  };

  pc.onsignalingstatechange = () => {
    console.log('[WebRTC] Signaling state changed:', pc.signalingState);
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState as RTCPeerConnectionState;
    console.log('[WebRTC] Connection state changed:', state);
    if (state) {
      opts.onConnectionStateChange(state);
    }
  };

  return pc;
}

// ── ICE candidate queue ───────────────────────────────────────────────────────

export class IceCandidateQueue {
  private queue: AnyPC[] = [];
  private remoteDescSet = false;
  private pc: AnyPC;

  constructor(pc: AnyPC) {
    this.pc = pc;
  }

  async add(candidateJson: string): Promise<void> {
    try {
      if (!candidateJson) return;
      const parsed = typeof candidateJson === 'string' ? JSON.parse(candidateJson) : candidateJson;
      if (!parsed || !parsed.candidate) return;

      const candInit: any = {
        candidate: parsed.candidate,
        sdpMid: parsed.sdpMid !== null && parsed.sdpMid !== undefined ? String(parsed.sdpMid) : '0',
        sdpMLineIndex: parsed.sdpMLineIndex !== null && parsed.sdpMLineIndex !== undefined ? Number(parsed.sdpMLineIndex) : 0,
      };
      if (parsed.usernameFragment) {
        candInit.usernameFragment = parsed.usernameFragment;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RTCIceCandidate } = require('./index');
      let candidate: any = candInit;
      if (typeof RTCIceCandidate === 'function') {
        try {
          candidate = new RTCIceCandidate(candInit);
        } catch {
          candidate = candInit;
        }
      }

      if (this.remoteDescSet && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(candidate).catch((err: any) => {
          console.warn('[WebRTC] addIceCandidate error:', err?.message || err);
        });
      } else {
        this.queue.push(candidate);
      }
    } catch (err) {
      console.warn('[WebRTC] IceCandidateQueue parse/add error:', err);
    }
  }

  async flush(): Promise<void> {
    this.remoteDescSet = true;
    if (!this.pc.remoteDescription) {
      console.warn('[WebRTC] flush called but pc.remoteDescription is not set yet, preserving buffer');
      return;
    }
    console.log(`[WebRTC] Flushing ${this.queue.length} queued ICE candidates`);
    const toFlush = [...this.queue];
    this.queue = [];
    for (const candidate of toFlush) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (err: any) {
        console.warn('[WebRTC] addIceCandidate error in flush:', err?.message || err);
      }
    }
  }
}

// ── Bitrate constraints ───────────────────────────────────────────────────────

const VIDEO_MAX_BITRATE_BPS = 600_000;

export async function applyBitrateConstraints(
  pc: AnyPC,
  video: boolean,
): Promise<void> {
  if (!pc.getSenders) return;
  const senders: AnyPC[] = pc.getSenders();
  for (const sender of senders) {
    if (!sender.track) continue;
    if (video && sender.track.kind === 'video') {
      const params = sender.getParameters ? sender.getParameters() : {};
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE_BPS;
      try {
        await sender.setParameters(params);
      } catch {
        // Not supported on all platforms
      }
    }
  }
}

// ── ICE restart ───────────────────────────────────────────────────────────────

export async function performIceRestart(pc: AnyPC): Promise<string> {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  return JSON.stringify(offer);
}
