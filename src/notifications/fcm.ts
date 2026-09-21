import { Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { showIncomingCallNotification, dismissCallNotification } from './notifee';
import { signInWithToken } from '@/firebase/auth';
import { setCallState } from '@/firebase/rtdb';

/**
 * Handles FCM background/killed messages.
 * Registered in index.js BEFORE expo-router entry.
 *
 * Message types:
 * - incoming_call: show full-screen incoming call notification
 * - call_cancel: dismiss the notification, show missed call
 */
export async function handleBackgroundFCM(
  message: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  if (Platform.OS === 'web') return;

  const data = message.data ?? {};
  const type = data['type'];

  switch (type) {
    case 'incoming_call': {
      const roomId = data['roomId'];
      const callerName = data['callerName'];
      const video = data['video'] === 'true';
      const durationSec = parseInt(data['durationSec'] ?? '300', 10);
      if (roomId && callerName) {
        await showIncomingCallNotification({
          roomId,
          callerName,
          video,
          durationSec,
        });
      }
      break;
    }

    case 'call_cancel': {
      const roomId = data['roomId'];
      if (roomId) {
        await dismissCallNotification(roomId);
      }
      break;
    }

    default:
      break;
  }
}
