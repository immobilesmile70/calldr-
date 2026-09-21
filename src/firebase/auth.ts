import {
  getAuth,
  signInWithCustomToken,
  signOut as _signOut,
  onAuthStateChanged,
  User,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { app } from './app';

/** Initialize Auth with AsyncStorage persistence on native, local on web */
function createAuth() {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized
    return getAuth(app);
  }
}

export const auth = createAuth();

/** Sign in with a custom token returned from our API */
export async function signInWithToken(customToken: string): Promise<User> {
  const cred = await signInWithCustomToken(auth, customToken);
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
