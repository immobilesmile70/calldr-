// ============================================================
// CalLdr — shared domain types
// ============================================================

/** Firestore: users/{uid} */
export interface UserDoc {
  username: string;
  email: string;
  code: string;
  onboarded: boolean;
  fcmTokens: string[];
  createdAt: number; // unix ms
}

/** Firestore: codes/{code} */
export interface CodeDoc {
  uid: string;
  createdAt: number;
}

/** Connection status */
export type ConnectionStatus = 'pending' | 'accepted';

/** Firestore: connections/{uidA_uidB} (uids sorted) */
export interface ConnectionDoc {
  members: [string, string];
  names: Record<string, string>; // uid → username
  status: ConnectionStatus;
  requester: string; // uid of who sent the request
  createdAt: number;
  acceptedAt?: number;
}

/** RTDB call state */
export type CallState =
  | 'ringing'
  | 'active'
  | 'ended'
  | 'declined'
  | 'cancelled'
  | 'missed'
  | 'busy';

/** RTDB: calls/{roomId} */
export interface CallRoom {
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  video: boolean;
  durationSec: number;
  state: CallState;
  createdAt: number;
  answeredAt?: number;
  endedAt?: number;
  endedBy?: string; // uid | 'timeout'
  offer?: string; // JSON-serialized RTCSessionDescription
  answer?: string;
  iceGen?: number; // incremented on ICE restart
  ice?: {
    caller?: Record<string, string>;
    callee?: Record<string, string>;
  };
  media?: Record<string, { mic: boolean; cam: boolean }>;
}

/** RTDB: incoming/{calleeUid} */
export interface IncomingCall {
  roomId: string;
  callerUid?: string;
  callerName: string;
  video: boolean;
  durationSec: number;
  ts: number;
}

/** API response shape */
export interface ApiResponse<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/** Duration options */
export const DURATION_OPTIONS = [5, 10, 15, 30, 60] as const;
export type DurationMinutes = (typeof DURATION_OPTIONS)[number];

/** Contact derived from a connection */
export interface Contact {
  connectionId: string;
  uid: string;
  username: string;
}
