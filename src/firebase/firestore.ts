import {
  getFirestore,
  doc,
  onSnapshot,
  query,
  collection,
  where,
  DocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { app } from './app';
import { UserDoc, ConnectionDoc } from '@shared/types';

export const db = getFirestore(app);

// Enable long-polling for React Native compatibility
// (experimentalAutoDetectLongPolling is set at init time via settings)
// In practice, Firestore SDK auto-detects on native.

/** Watch the current user's Firestore doc. Returns unsubscribe fn. */
export function watchUserDoc(
  uid: string,
  cb: (data: UserDoc | null) => void,
): Unsubscribe {
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap: DocumentSnapshot) => {
      cb(snap.exists() ? (snap.data() as UserDoc) : null);
    },
    (err) => {
      console.error('[Firestore] watchUserDoc error', err);
      cb(null);
    },
  );
}

/** Watch all connections where uid is a member. Returns unsubscribe fn. */
export function watchConnections(
  uid: string,
  cb: (connections: Array<{ id: string } & ConnectionDoc>) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'connections'),
    where('members', 'array-contains', uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as ConnectionDoc),
      }));
      cb(docs);
    },
    (err) => {
      console.error('[Firestore] watchConnections error', err);
      cb([]);
    },
  );
}
