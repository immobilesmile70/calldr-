import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { onAuthChange, signOut, User } from '@/firebase/auth';
import { watchUserDoc } from '@/firebase/firestore';
import { UserDoc } from '@shared/types';
import {
  getCurrentFcmToken,
  registerFcmToken,
  removeFcmToken,
  setupFcmTokenRefresh,
} from '@/firebase/fcm';
import { requestNotificationPermission } from '@/notifications/permissions';

export interface AuthState {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
}

export const AuthContext = createContext<
  AuthState & {
    logout: () => Promise<void>;
    refreshUserDoc: () => void;
  }
>({
  user: null,
  userDoc: null,
  loading: true,
  logout: async () => {},
  refreshUserDoc: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Provides auth state + Firestore user doc.
 * Use this at the root layout level.
 */
export function useAuthProvider() {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [docTrigger, setDocTrigger] = useState(0);

  useEffect(() => {
    let unwatchDoc: (() => void) | undefined;

    const unsubAuth = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);

      if (unwatchDoc) {
        unwatchDoc();
        unwatchDoc = undefined;
      }

      if (firebaseUser) {
        // Watch user doc
        unwatchDoc = watchUserDoc(firebaseUser.uid, (doc) => {
          setUserDoc(doc);
          setLoading(false);
        });

        // FCM setup
        const token = await getCurrentFcmToken();
        if (token) {
          await registerFcmToken(token).catch(() => {});
        }
        await requestNotificationPermission().catch(() => {});
      } else {
        setUserDoc(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unwatchDoc?.();
    };
  }, [docTrigger]);

  // FCM token refresh
  useEffect(() => {
    const unsub = setupFcmTokenRefresh((token) => {
      registerFcmToken(token).catch(() => {});
    });
    return unsub;
  }, []);

  const logout = useCallback(async () => {
    const token = await getCurrentFcmToken();
    if (token) await removeFcmToken(token).catch(() => {});
    await signOut();
  }, []);

  const refreshUserDoc = useCallback(() => {
    setDocTrigger((n) => n + 1);
  }, []);

  return { user, userDoc, loading, logout, refreshUserDoc };
}
