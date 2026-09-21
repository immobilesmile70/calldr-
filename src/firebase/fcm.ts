import { Platform } from 'react-native';
import { getIdToken } from './auth';

/** Register or update the FCM token in the backend */
export async function registerFcmToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return; // No FCM on web
  try {
    const idToken = await getIdToken();
    if (!idToken) return;

    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
    await fetch(`${apiUrl}/api/profile/fcm-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn('[FCM] Failed to register token', err);
  }
}

/** Remove FCM token on sign-out */
export async function removeFcmToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const idToken = await getIdToken();
    if (!idToken) return;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
    await fetch(`${apiUrl}/api/profile/fcm-token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn('[FCM] Failed to remove token', err);
  }
}

/**
 * Set up FCM token refresh listener.
 * Returns unsubscribe fn.
 * Only call on native.
 */
export function setupFcmTokenRefresh(
  onToken: (token: string) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};
  // Dynamic import to avoid web bundle issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const messaging = require('@react-native-firebase/messaging').default;
  return messaging().onTokenRefresh((token: string) => {
    onToken(token);
    registerFcmToken(token).catch(() => {});
  });
}

/** Get current FCM token */
export async function getCurrentFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messaging = require('@react-native-firebase/messaging').default;
    const token = await messaging().getToken();
    return token as string;
  } catch (err) {
    console.warn('[FCM] getToken failed', err);
    return null;
  }
}
