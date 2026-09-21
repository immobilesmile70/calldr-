import { useState, useEffect, useMemo } from 'react';
import { watchConnections } from '@/firebase/firestore';
import { ConnectionDoc, Contact } from '@shared/types';

export interface ConnectionsState {
  contacts: Contact[];
  pendingIncoming: Array<{ id: string } & ConnectionDoc>;
  loading: boolean;
}

/**
 * Subscribes to all connections for the current user.
 * Splits into accepted contacts and pending incoming requests.
 */
export function useConnections(uid: string | null): ConnectionsState {
  const [raw, setRaw] = useState<Array<{ id: string } & ConnectionDoc>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = watchConnections(uid, (docs) => {
      setRaw(docs);
      setLoading(false);
    });

    return unsub;
  }, [uid]);

  const contacts = useMemo<Contact[]>(
    () =>
      raw
        .filter((c) => c.status === 'accepted')
        .map((c) => {
          const theirUid = c.members.find((m) => m !== uid) ?? '';
          return {
            connectionId: c.id,
            uid: theirUid,
            username: c.names[theirUid] ?? '',
          };
        })
        .sort((a, b) => a.username.localeCompare(b.username)),
    [raw, uid],
  );

  const pendingIncoming = useMemo(
    () =>
      raw.filter(
        (c) => c.status === 'pending' && c.requester !== uid,
      ),
    [raw, uid],
  );

  return { contacts, pendingIncoming, loading };
}
