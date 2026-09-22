import React, { useEffect, useRef } from 'react';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { AuthContext, useAuthProvider } from '@/lib/useAuth';
import { watchIncoming, deleteIncoming } from '@/firebase/rtdb';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout:
 * - Provides auth context
 * - Guards routes by auth state + onboarding flag
 * - Attaches RTDB incoming listener on web and native
 * - Manages splash screen
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Ogg-Medium': require('../public/Ogg-Medium.ttf'),
  });

  const authState = useAuthProvider();
  const { user, userDoc, loading } = authState;
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();

  const lastHandledRoomIdRef = useRef<string | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // Hide splash once fonts + auth are resolved
  useEffect(() => {
    if (!loading && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading, fontsLoaded]);

  // Route guard
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (loading || !fontsLoaded) return;

    const segs = segments as string[];
    const isAuthRoute = segs.some(
      (s) => s === '(auth)' || s === 'login' || s === 'signup' || s === 'forgot'
    );
    const isOnboardingRoute = segs.some(
      (s) => s === '(onboarding)' || s === 'username'
    );

    if (!user) {
      if (!isAuthRoute && segs.length > 0 && segs[0] !== 'index') {
        router.replace('/');
      }
      return;
    }

    if (userDoc && !userDoc.onboarded) {
      if (!isOnboardingRoute) {
        router.replace('/(onboarding)/username');
      }
      return;
    }

    if (userDoc?.onboarded) {
      if (isAuthRoute || isOnboardingRoute || segs.length === 0 || segs[0] === 'index') {
        router.replace('/(main)/home');
      }
    }
  }, [user, userDoc, loading, fontsLoaded, segments, rootNavigationState?.key]);

  // RTDB incoming call listener (active on web and native foreground)
  useEffect(() => {
    if (!user) return;

    let unwatch: (() => void) | undefined;

    const attach = () => {
      if (unwatch) return;
      unwatch = watchIncoming(user.uid, (incoming) => {
        if (!incoming || !incoming.roomId) {
          lastHandledRoomIdRef.current = null;
          return;
        }

        // Stale call (> 45s) — clean up and ignore
        if (incoming.ts && Date.now() - incoming.ts > 45_000) {
          deleteIncoming(user.uid).catch(() => {});
          return;
        }

        const segs = segmentsRef.current as string[];
        const inCall = segs.some((s) => s === '(call)' || s === 'incoming' || s === 'active');
        if (inCall && lastHandledRoomIdRef.current === incoming.roomId) {
          return;
        }

        lastHandledRoomIdRef.current = incoming.roomId;

        router.push({
          pathname: '/(call)/incoming',
          params: {
            roomId: incoming.roomId,
            callerName: incoming.callerName,
            video: String(incoming.video),
            durationSec: String(incoming.durationSec),
          },
        });
      });
    };

    const detach = () => {
      unwatch?.();
      unwatch = undefined;
    };

    // Attach when active (or on web)
    if (Platform.OS === 'web' || AppState.currentState === 'active') attach();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attach();
      else if (Platform.OS !== 'web') detach();
    });

    return () => {
      sub.remove();
      detach();
    };
  }, [user]);

  // Notifee initial notification & foreground event listener (Android only)
  useEffect(() => {
    if (!user || Platform.OS !== 'android') return;

    let notifee: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      notifee = require('@notifee/react-native').default;
    } catch {
      return;
    }

    if (!notifee) return;

    // Check if app was launched from a notification
    notifee.getInitialNotification().then((initial: any) => {
      if (!initial) return;
      const data = initial.notification?.data ?? {};
      if (data.type === 'incoming_call' && data.roomId) {
        lastHandledRoomIdRef.current = data.roomId;
        const pressActionId = initial.pressAction?.id;
        if (pressActionId === 'accept_call') {
          deleteIncoming(user.uid).catch(() => {});
          notifee.cancelNotification(initial.notification.id).catch(() => {});
          router.replace({
            pathname: '/(call)/active',
            params: {
              roomId: data.roomId,
              role: 'callee',
              contactName: data.callerName,
              video: data.video,
              durationSec: data.durationSec,
            },
          });
        } else {
          router.push({
            pathname: '/(call)/incoming',
            params: {
              roomId: data.roomId,
              callerName: data.callerName,
              video: data.video,
              durationSec: data.durationSec,
            },
          });
        }
      }
    }).catch(() => {});

    // Listen for notification press while app is in foreground
    const unsubForeground = notifee.onForegroundEvent(({ type, detail }: any) => {
      if (type === 2 /* ACTION_PRESS */) {
        const actionId = detail.pressAction?.id;
        const data = detail.notification?.data ?? {};
        if (actionId === 'accept_call' && data.roomId) {
          lastHandledRoomIdRef.current = data.roomId;
          deleteIncoming(user.uid).catch(() => {});
          notifee.cancelNotification(detail.notification.id).catch(() => {});
          router.replace({
            pathname: '/(call)/active',
            params: {
              roomId: data.roomId,
              role: 'callee',
              contactName: data.callerName,
              video: data.video,
              durationSec: data.durationSec,
            },
          });
        } else if (actionId === 'decline_call' && data.roomId) {
          deleteIncoming(user.uid).catch(() => {});
          notifee.cancelNotification(detail.notification.id).catch(() => {});
        }
      }
    });

    return () => {
      unsubForeground?.();
    };
  }, [user]);

  if (!fontsLoaded) return null;

  return (
    <AuthContext.Provider value={authState}>
      <StatusBar style="light" backgroundColor="#0E0E11" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0E0E11' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="(call)" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </AuthContext.Provider>
  );
}
