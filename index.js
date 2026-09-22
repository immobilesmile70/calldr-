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
  try {
    const messagingModule = require('@react-native-firebase/messaging');
    const messaging = messagingModule?.default || messagingModule;
    if (typeof messaging === 'function') {
      const { handleBackgroundFCM } = require('./src/notifications/fcm');
      messaging().setBackgroundMessageHandler(handleBackgroundFCM);
    }
  } catch (err) {
    console.warn('[FCM] Failed to set background message handler:', err);
  }
}

// ── Notifee background event handler ───────────────────────────────────────
if (Platform.OS !== 'web') {
  try {
    const notifeeModule = require('@notifee/react-native');
    const notifee = notifeeModule?.default || notifeeModule;
    if (notifee && typeof notifee.onBackgroundEvent === 'function') {
      const { handleNotifeeBackgroundEvent } = require('./src/notifications/notifee');
      notifee.onBackgroundEvent(handleNotifeeBackgroundEvent);
    }
  } catch (err) {
    console.warn('[Notifee] Failed to register background event handler:', err);
  }
}

// ── Expo Router entry ───────────────────────────────────────────────────────
import 'expo-router/entry';
