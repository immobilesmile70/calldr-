/**
 * Custom entry point for CalLdr.
 *
 * Order matters:
 * 1. Register FCM background message handler (must run before any UI)
 * 2. Register notifee background event handler
 * 3. Import expo-router entry (registers the React app)
 */
import { AppRegistry, Platform } from 'react-native';

// ── FCM background handler ──────────────────────────────────────────────────
// Only register on native — the Firebase JS SDK handles web differently.
if (Platform.OS !== 'web') {
  // Dynamic import avoids crashing the web bundle which doesn't have
  // @react-native-firebase/messaging.
  const { default: messaging } = require('@react-native-firebase/messaging');
  const { handleBackgroundFCM } = require('./src/notifications/fcm');
  messaging().setBackgroundMessageHandler(handleBackgroundFCM);
}

// ── Notifee background event handler ───────────────────────────────────────
if (Platform.OS !== 'web') {
  const notifee = require('@notifee/react-native').default;
  const { handleNotifeeBackgroundEvent } = require('./src/notifications/notifee');
  notifee.onBackgroundEvent(handleNotifeeBackgroundEvent);
}

// ── Expo Router entry ───────────────────────────────────────────────────────
import 'expo-router/entry';
