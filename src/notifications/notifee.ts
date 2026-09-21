import { Platform } from 'react-native';
import type notifeeType from '@notifee/react-native';
import type { Event } from '@notifee/react-native';

// Lazy notifee import (native only)
let notifee: typeof notifeeType | null = null;
if (Platform.OS !== 'web') {
  notifee = require('@notifee/react-native').default as typeof notifeeType;
}

const INCOMING_CALL_CHANNEL_ID = 'calldr-incoming-call';
const ONGOING_CALL_CHANNEL_ID = 'calldr-ongoing-call';

export interface IncomingCallInfo {
  roomId: string;
  callerName: string;
  video: boolean;
  durationSec: number;
}

/**
 * Shows a full-screen incoming call notification (Android only).
 * Category CALL, fullScreenIntent, Accept + Decline actions, 30s timeout.
 */
export async function showIncomingCallNotification(
  info: IncomingCallInfo,
): Promise<void> {
  if (!notifee || Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: INCOMING_CALL_CHANNEL_ID,
    name: 'Incoming Calls',
    importance: 5, // IMPORTANCE_HIGH
    vibration: true,
    vibrationPattern: [0, 500, 250, 500],
    sound: 'default',
  });

  const durationLabel = `${Math.round(info.durationSec / 60)} min`;
  const modeLabel = info.video ? 'Video' : 'Audio';

  await notifee.displayNotification({
    id: `call_${info.roomId}`,
    title: info.callerName,
    body: `${modeLabel} call - ${durationLabel}`,
    data: {
      type: 'incoming_call',
      roomId: info.roomId,
      callerName: info.callerName,
      video: String(info.video),
      durationSec: String(info.durationSec),
    },
    android: {
      channelId: INCOMING_CALL_CHANNEL_ID,
      category: 'call' as const,
      fullScreenAction: {
        id: 'full_screen',
        launchActivity: 'default',
      },
      importance: 5,
      ongoing: true,
      asForegroundService: false,
      timeoutAfter: 30_000,
      actions: [
        {
          title: 'Accept',
          pressAction: {
            id: 'accept_call',
            launchActivity: 'default',
          },
        },
        {
          title: 'Decline',
          pressAction: { id: 'decline_call' },
        },
      ],
    },
  });
}

/** Dismiss incoming call notification and show a quiet "Missed call" notice */
export async function dismissCallNotification(roomId: string): Promise<void> {
  if (!notifee || Platform.OS !== 'android') return;
  await notifee.cancelNotification(`call_${roomId}`);
}

/**
 * Shows an ongoing call foreground service notification.
 * Displayed during an active call to keep the service alive.
 */
export async function showOngoingCallNotification(
  contactName: string,
): Promise<void> {
  if (!notifee || Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: ONGOING_CALL_CHANNEL_ID,
    name: 'Ongoing Call',
    importance: 3, // IMPORTANCE_DEFAULT
  });

  await notifee.displayNotification({
    id: 'ongoing_call',
    title: `Call with ${contactName}`,
    body: 'Tap to return to call',
    android: {
      channelId: ONGOING_CALL_CHANNEL_ID,
      ongoing: true,
      asForegroundService: true,
      foregroundServiceTypes: ['microphone', 'camera'],
      actions: [
        {
          title: 'Hang up',
          pressAction: { id: 'hang_up_call' },
        },
      ],
    },
  });
}

/** Dismiss ongoing call notification and stop foreground service */
export async function dismissOngoingCallNotification(): Promise<void> {
  if (!notifee || Platform.OS !== 'android') return;
  await notifee.cancelNotification('ongoing_call');
  await notifee.stopForegroundService();
}

/**
 * Notifee background event handler.
 * Registered in index.js.
 *
 * Handles:
 * - accept_call: launch app into call (pressAction has launchActivity)
 * - decline_call: write RTDB declined state headlessly
 * - hang_up_call: write RTDB ended state
 */
export async function handleNotifeeBackgroundEvent({
  type,
  detail,
}: Event): Promise<void> {
  const { notification, pressAction } = detail;
  const data = notification?.data ?? {};
  const actionId = pressAction?.id;
  const roomId = data['roomId'] as string | undefined;

  // EventType.ACTION_PRESS = 2
  if (type !== 2 || !actionId || !roomId) return;

  if (actionId === 'decline_call') {
    // Need to restore auth state before writing RTDB
    // On Android, the auth state persists via AsyncStorage
    const { setCallState } = require('@/firebase/rtdb');
    await setCallState(roomId, 'declined', { endedBy: 'callee' });
    await dismissCallNotification(roomId);
  } else if (actionId === 'hang_up_call') {
    const { setCallState } = require('@/firebase/rtdb');
    await setCallState(roomId, 'ended', { endedBy: 'callee' });
    await dismissOngoingCallNotification();
  }
}
