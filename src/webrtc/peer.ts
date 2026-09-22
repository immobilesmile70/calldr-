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
  const resp = await fetch(`${API_URL}/calls/ice`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!resp.ok) {
    console.warn('[WebRTC] Failed to fetch ICE servers, falling back to Google STUN');
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];
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
    if (event.candidate) {
      opts.onIceCandidate(JSON.stringify(event.candidate));
    }
  };

  pc.ontrack = (event: AnyPC) => {
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
      } catch {
        // ignore
      }
      opts.onTrack(remoteStream);
    }
  };

  pc.onconnectionstatechange = () => {
    opts.onConnectionStateChange(pc.connectionState as RTCPeerConnectionState);
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RTCIceCandidate } = require('./index');
    const candidate = new RTCIceCandidate(JSON.parse(candidateJson) as object);
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
