import { useEffect, useRef, useState, useCallback } from 'react';
import {
  watchCallRoom,
  setCallState,
  getServerTimeOffset,
  deleteCallRoom,
  deleteIce,
  deleteIncoming,
} from '@/firebase/rtdb';
import { CallRoom, CallState } from '@shared/types';

export interface CallRoomState {
  room: CallRoom | null;
  loading: boolean;
  serverOffset: number; // ms offset between local and server clocks
}

/**
 * Subscribes to the RTDB call room and tracks server time offset.
 * Cleans up the room when call ends (after a short delay).
 */
export function useCallRoom(
  roomId: string | null,
  myUid: string | null,
): CallRoomState & {
  endCall: (endedBy: string) => Promise<void>;
} {
  const [room, setRoom] = useState<CallRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getServerTimeOffset().then(setServerOffset).catch(() => {});
  }, []);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const unsubscribe = watchCallRoom(roomId, (data) => {
      setRoom(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [roomId]);

  const endCall = useCallback(
    async (endedBy: string) => {
      if (!roomId) return;
      try {
        await setCallState(roomId, 'ended', {
          endedBy,
          endedAt: Date.now(),
        });
      } catch {
        // ignore
      }
      // Cleanup ICE and incoming
      if (myUid && room) {
        const calleeUid = room.calleeUid;
        deleteIncoming(calleeUid).catch(() => {});
        deleteIce(roomId).catch(() => {});
      }
      // Delete room after 3s delay (allows the other side to see final state)
      cleanupTimerRef.current = setTimeout(() => {
        deleteCallRoom(roomId).catch(() => {});
      }, 3000);
    },
    [roomId, room, myUid],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
      }
    };
  }, []);

  return { room, loading, serverOffset, endCall };
}

/** Determine if the current user is the caller */
export function useIsCallerRole(
  room: CallRoom | null,
  myUid: string | null,
): boolean {
  return room?.callerUid === myUid;
}

/** Validate allowed state transitions */
export function isValidTransition(
  from: CallState,
  to: CallState,
): boolean {
  const allowed: Partial<Record<CallState, CallState[]>> = {
    ringing: ['active', 'declined', 'cancelled', 'missed', 'busy'],
    active: ['ended'],
    ended: [],
    declined: [],
    cancelled: [],
    missed: [],
    busy: [],
  };
  return allowed[from]?.includes(to) ?? false;
}
