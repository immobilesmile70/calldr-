import { Platform, Linking } from 'react-native';

let PermissionsAndroid: typeof import('react-native').PermissionsAndroid | null = null;
if (Platform.OS === 'android') {
  PermissionsAndroid = require('react-native').PermissionsAndroid;
}

/**
 * Request POST_NOTIFICATIONS permission on Android 13+ (API 33+).
 * Must be called at the right moment (after onboarding, before first call).
 *
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!PermissionsAndroid) return false;

  // POST_NOTIFICATIONS is only required on Android 13+ (API 33)
  const { PERMISSIONS, RESULTS, request, check } = PermissionsAndroid;

  // The constant may not exist on older RN versions — guard it
  const POST_NOTIFICATIONS = PERMISSIONS.POST_NOTIFICATIONS;
  if (!POST_NOTIFICATIONS) return true; // Not required on this Android version

  const current = await check(POST_NOTIFICATIONS);
  if (current === RESULTS.GRANTED) return true;

  const result = await request(POST_NOTIFICATIONS, {
    title: 'Allow notifications',
    message:
      'CalLdr needs notification permission to alert you about incoming calls when the app is in the background.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });

  return result === RESULTS.GRANTED;
}

/**
 * Check if the app can display full-screen intent notifications (Android 14+).
 * If not, guide the user to settings.
 * We do NOT request battery optimization exemption per spec.
 */
export async function checkFullScreenIntentPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // Use notifee's power manager API
    const notifee = require('@notifee/react-native').default;
    const settings = await notifee.getNotificationSettings();
    if (settings.android?.alarm === 0 /* BLOCKED */) {
      // Guide user but don't block
      console.warn('[Permissions] Full-screen intent may be blocked by system settings');
    }
  } catch {
    // Ignore — not all Android versions support this check
  }
}
