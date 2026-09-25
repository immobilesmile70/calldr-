import {
  getAuth,
  initializeAuth,
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as _signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { app } from './app';

/**
 * Initialize Auth:
 * - On native (Android/iOS): uses getReactNativePersistence(AsyncStorage)
 *   so auth tokens survive app kill, backgrounding, and notification clicks.
 * - On web: uses getAuth(app) with default IndexedDB persistence.
 */
function createAuth() {
  if (Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getReactNativePersistence } = require('firebase/auth');
      if (typeof getReactNativePersistence === 'function') {
        return initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      }
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = createAuth();

/** Sign in with a custom token returned from our API */
export async function signInWithToken(customToken: string): Promise<User> {
  const cred = await signInWithCustomToken(auth, customToken);
  return cred.user;
}

/** Sign in with Google on Web using Firebase Popup */
export async function signInWithGoogleWeb(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

/** Sign out and clear persistence */
export async function signOut(): Promise<void> {
  await _signOut(auth);
}

/** Get the current user's ID token */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** Subscribe to auth state changes */
export function onAuthChange(
  cb: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, cb);
}

export { User };
