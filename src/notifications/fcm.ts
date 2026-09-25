import { Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { showNativeIncomingCall, dismissNativeIncomingCall } from './nativeCall';
import { showIncomingCallNotification, dismissCallNotification } from './notifee';

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
      const roomId = typeof data['roomId'] === 'string' ? data['roomId'] : undefined;
      const calleeUid = typeof data['calleeUid'] === 'string' ? data['calleeUid'] : undefined;
      const callerName = typeof data['callerName'] === 'string' ? data['callerName'] : undefined;
      const video = data['video'] === 'true';
      const durationSecStr = typeof data['durationSec'] === 'string' ? data['durationSec'] : '300';
      const durationSec = parseInt(durationSecStr, 10);
      if (roomId && callerName) {
        if (Platform.OS === 'android') {
          await showNativeIncomingCall({
            roomId,
            callerName,
            video,
            durationSec,
            calleeUid,
          });
        } else {
          await showIncomingCallNotification({
            roomId,
            calleeUid,
            callerName,
            video,
            durationSec,
          });
        }
      }
      break;
    }

    case 'call_cancel': {
      const roomId = typeof data['roomId'] === 'string' ? data['roomId'] : undefined;
      if (roomId) {
        if (Platform.OS === 'android') {
          await dismissNativeIncomingCall();
        }
        await dismissCallNotification(roomId);
      }
      break;
    }

    default:
      break;
  }
}
