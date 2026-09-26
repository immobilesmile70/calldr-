import {
  getDatabase,
  ref,
  onValue,
  set,
  remove,
  push,
  update,
  get,
  off,
  DataSnapshot,
  serverTimestamp,
} from 'firebase/database';
import { app } from './app';
import { CallRoom, IncomingCall, CallState } from '@shared/types';

export const rtdb = getDatabase(app);

/** Returns the server time offset (ms). Use to compute client-adjusted now. */
export function getServerTimeOffset(): Promise<number> {
  return new Promise((resolve) => {
    const offsetRef = ref(rtdb, '.info/serverTimeOffset');
    onValue(
      offsetRef,
      (snap: DataSnapshot) => {
        off(offsetRef);
        resolve(snap.val() as number ?? 0);
      },
      { onlyOnce: true },
    );
  });
}

// ── Call room ─────────────────────────────────────────────────────────────────

export function watchCallRoom(
  roomId: string,
  cb: (room: CallRoom | null) => void,
): () => void {
  const roomRef = ref(rtdb, `calls/${roomId}`);
  const handler = (snap: DataSnapshot) => {
    cb(snap.val() as CallRoom | null);
  };
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
}

export async function writeOffer(
  roomId: string,
  offerJson: string,
): Promise<void> {
  await set(ref(rtdb, `calls/${roomId}/offer`), offerJson);
}

export async function writeAnswer(
  roomId: string,
  answerJson: string,
): Promise<void> {
  await set(ref(rtdb, `calls/${roomId}/answer`), answerJson);
}

export async function pushIceCandidate(
  roomId: string,
  side: 'caller' | 'callee',
  candidateJson: string,
): Promise<void> {
  await push(ref(rtdb, `calls/${roomId}/ice/${side}`), candidateJson);
}

export async function setCallState(
  roomId: string,
  state: CallState,
  extra?: Partial<CallRoom>,
): Promise<void> {
  const updates: Record<string, any> = { state, ...extra };
  if (state === 'active') {
    updates.answeredAt = serverTimestamp();
  }
  if (state === 'ended' || state === 'declined' || state === 'cancelled' || state === 'missed') {
    updates.endedAt = serverTimestamp();
    try {
      const snap = await get(ref(rtdb, `calls/${roomId}`));
      if (snap.exists()) {
        const val = snap.val() as CallRoom;
        if (val?.callerUid && val?.calleeUid) {
          const [u1, u2] = [val.callerUid, val.calleeUid].sort();
          await remove(ref(rtdb, `active_pairs/${u1}_${u2}`)).catch(() => {});
        }
      }
    } catch {
      // ignore
    }
  }
  await update(ref(rtdb, `calls/${roomId}`), updates);
}

export async function setMediaFlags(
  roomId: string,
  uid: string,
  mic: boolean,
  cam: boolean,
): Promise<void> {
  await set(ref(rtdb, `calls/${roomId}/media/${uid}`), { mic, cam });
}

export async function deleteCallRoom(roomId: string): Promise<void> {
  await remove(ref(rtdb, `calls/${roomId}`));
}

export async function deleteIce(roomId: string): Promise<void> {
  await remove(ref(rtdb, `calls/${roomId}/ice`));
}

// ── Incoming ──────────────────────────────────────────────────────────────────

export function watchIncoming(
  uid: string,
  cb: (incoming: IncomingCall | null) => void,
): () => void {
  const incomingRef = ref(rtdb, `incoming/${uid}`);
  const handler = (snap: DataSnapshot) => {
    cb(snap.val() as IncomingCall | null);
  };
  onValue(incomingRef, handler);
  return () => off(incomingRef, 'value', handler);
}

export async function deleteIncoming(uid: string): Promise<void> {
  await remove(ref(rtdb, `incoming/${uid}`));
}
