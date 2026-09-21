import {
  getAuth,
  signInWithCustomToken,
  signOut as _signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { app } from './app';

/** Initialize Auth — on native we use AsyncStorage via @react-native-firebase/auth,
 *  but since we use the JS Firebase SDK with Custom Token we just persist via getAuth.
 *  The auth state is already persisted via AsyncStorage on native through IndexedDB polyfill.
 */
function createAuth() {
  return getAuth(app);
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
