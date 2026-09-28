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

export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'fb1ed35bf91aa760f988666a',
    credential: '9bAgXvfCTEwG0WFz',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'fb1ed35bf91aa760f988666a',
    credential: '9bAgXvfCTEwG0WFz',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'fb1ed35bf91aa760f988666a',
    credential: '9bAgXvfCTEwG0WFz',
  },
];

export const HIGH_AVAILABILITY_STUN_SERVERS: IceServer[] = DEFAULT_ICE_SERVERS;

let cachedIceServers: IceServer[] | null = null;
let cacheTimestamp = 0;
const ICE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchIceServers(idToken?: string | null): Promise<IceServer[]> {
  const now = Date.now();
  if (cachedIceServers && now - cacheTimestamp < ICE_CACHE_TTL_MS) {
    return cachedIceServers;
  }

  try {
    const headers: Record<string, string> = {};
    if (idToken) headers.Authorization = `Bearer ${idToken}`;

    const fetchPromise = fetch(`${API_URL}/calls/ice`, { headers }).then(async (resp) => {
      if (!resp.ok) return DEFAULT_ICE_SERVERS;
      const data = (await resp.json()) as { data?: { iceServers?: IceServer[] } };
      return data?.data?.iceServers && data.data.iceServers.length > 0
        ? data.data.iceServers
        : DEFAULT_ICE_SERVERS;
    });

    const timeoutPromise = new Promise<IceServer[]>((resolve) => {
      setTimeout(() => resolve(cachedIceServers || DEFAULT_ICE_SERVERS), 3500);
    });

    const servers = await Promise.race([fetchPromise, timeoutPromise]);
    const hasTurn = servers.some((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
    });
    if (hasTurn) {
      cachedIceServers = servers;
      cacheTimestamp = now;
    }
    return servers;
  } catch (err) {
    console.warn('[WebRTC] Error fetching ICE servers, using default ICE configuration:', err);
    return cachedIceServers || DEFAULT_ICE_SERVERS;
  }
}

/**
 * Ensures audio (and video if enabled) media descriptions in SDP are set to sendrecv.
 * This fixes react-native-webrtc ignoring createAnswer options and defaulting to recvonly.
 */
export function ensureSendRecvSdp(sdp: string, isVideo: boolean): string {
  if (!sdp) return sdp;

  const lines = sdp.split(/\r?\n/);
  let currentMedia: 'audio' | 'video' | null = null;
  const resultLines: string[] = [];

  for (const line of lines) {
    if (line == null) continue;
    if (line.startsWith('m=audio')) {
      currentMedia = 'audio';
    } else if (line.startsWith('m=video')) {
      currentMedia = 'video';
    } else if (line.startsWith('m=')) {
      currentMedia = null;
    }

    if (currentMedia === 'audio') {
      if (line === 'a=recvonly' || line === 'a=sendonly' || line === 'a=inactive') {
        resultLines.push('a=sendrecv');
        continue;
      }
    } else if (currentMedia === 'video' && isVideo) {
      if (line === 'a=recvonly' || line === 'a=sendonly' || line === 'a=inactive') {
        resultLines.push('a=sendrecv');
        continue;
      }
    }

    resultLines.push(line);
  }

  const delimiter = sdp.includes('\r\n') ? '\r\n' : '\n';
  return resultLines.join(delimiter);
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
    // On mobile cellular, pre-gathering 10 ports saturates carrier NAT socket buffers; use 0 on native, 2 on web
    iceCandidatePoolSize: Platform.OS === 'web' ? 2 : 0,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });

  let remoteStream: any = null;

  pc.onicecandidate = (event: AnyPC) => {
    if (event.candidate && event.candidate.candidate) {
      const c = event.candidate;
      const candidateInit: any = {
        candidate: c.candidate,
      };
      if (c.sdpMid != null) {
        candidateInit.sdpMid = String(c.sdpMid);
      }
      if (c.sdpMLineIndex != null) {
        candidateInit.sdpMLineIndex = Number(c.sdpMLineIndex);
      }
      if (c.usernameFragment) {
        candidateInit.usernameFragment = c.usernameFragment;
      }
      console.log('[WebRTC] Local ICE candidate gathered:', candidateInit.candidate);
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
      };
      if (parsed.sdpMid != null) {
        candInit.sdpMid = String(parsed.sdpMid);
      }
      if (parsed.sdpMLineIndex != null) {
        candInit.sdpMLineIndex = Number(parsed.sdpMLineIndex);
      }
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
        await this.pc.addIceCandidate(candidate).then(() => {
          console.log('[WebRTC] Applied remote ICE candidate:', candInit.candidate?.slice(0, 50));
        }).catch((err: any) => {
          console.warn('[WebRTC] addIceCandidate error:', err?.message || err);
        });
      } else {
        console.log(`[WebRTC] Buffering remote ICE candidate (queue size: ${this.queue.length + 1})`);
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
