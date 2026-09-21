import { useState, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { computeEndsAt, msRemaining } from '@shared/code';

const WARNING_MS = 60_000;
const TICK_INTERVAL_MS = 500;

export interface TimerState {
  msLeft: number;
  isWarning: boolean;
  isExpired: boolean;
  formatted: string; // mm:ss
}

/**
 * Countdown timer for the call screen.
 *
 * Uses RTDB server time offset so both caller and callee agree on remaining time.
 * Fires haptic at 60s warning.
 * Calls `onExpire` at 0.
 */
export function useCallTimer(
  answeredAt: number | undefined,
  durationSec: number | undefined,
  serverOffset: number,
  onExpire: () => void,
): TimerState {
  const [msLeft, setMsLeft] = useState<number>(
    answeredAt && durationSec
      ? msRemaining(computeEndsAt(answeredAt, durationSec), Date.now() + serverOffset)
      : (durationSec ?? 0) * 1000,
  );

  const warningFiredRef = useRef(false);
  const expireFiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!answeredAt || !durationSec) return;

    const endsAt = computeEndsAt(answeredAt, durationSec);

    const tick = () => {
      const serverNow = Date.now() + serverOffset;
      const remaining = msRemaining(endsAt, serverNow);
      setMsLeft(remaining);

      if (!warningFiredRef.current && remaining <= WARNING_MS && remaining > 0) {
        warningFiredRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }

      if (!expireFiredRef.current && remaining === 0) {
        expireFiredRef.current = true;
        onExpireRef.current();
      }
    };

    tick(); // immediate first tick
    const interval = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [answeredAt, durationSec, serverOffset]);

  const isWarning = msLeft > 0 && msLeft <= WARNING_MS;
  const isExpired = msLeft === 0 && !!answeredAt;

  const formatted = formatMs(msLeft);

  return { msLeft, isWarning, isExpired, formatted };
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
