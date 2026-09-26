import React, { useEffect, useRef } from 'react';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { AuthContext, useAuthProvider } from '@/lib/useAuth';
import { watchIncoming, deleteIncoming, setCallState } from '@/firebase/rtdb';
import { showIncomingCallNotification, dismissCallNotification } from '@/notifications/notifee';
import {
  showNativeIncomingCall,
  dismissNativeIncomingCall,
  getInitialCallAction,
  subscribeCallAction,
} from '@/notifications/nativeCall';

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

    const isCallRoute = segs.some(
      (s) => s === '(call)' || s === 'active' || s === 'incoming'
    );

    if (!user) {
      if (!isAuthRoute && !isCallRoute && segs.length > 0 && segs[0] !== 'index') {
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

  // Web Service Worker & OS Notification registration
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });

    // Request notification permission if not yet decided
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    // Listen for SW messages (e.g. DECLINE_CALL, ACCEPT_CALL from notification click)
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'DECLINE_CALL') {
        if (user) {
          deleteIncoming(user.uid).catch(() => {});
        }
      } else if (data.type === 'ACCEPT_CALL') {
        if (user && data.roomId) {
          deleteIncoming(user.uid).catch(() => {});
          router.replace({
            pathname: '/(call)/active',
            params: {
              roomId: data.roomId,
              role: 'callee',
              contactName: data.callerName || 'Caller',
              video: String(data.video ?? false),
              durationSec: String(data.durationSec ?? 300),
            },
          });
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [user]);

  // RTDB incoming call listener (active on web and native foreground/background)
  useEffect(() => {
    if (!user) return;

    let unwatch: (() => void) | undefined;

    const attach = () => {
      if (unwatch) return;
      unwatch = watchIncoming(user.uid, (incoming) => {
        if (!incoming || !incoming.roomId) {
          if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'CLOSE_CALL_NOTIFICATION',
              roomId: lastHandledRoomIdRef.current,
            });
          }
          if (Platform.OS === 'android') {
            dismissNativeIncomingCall().catch(() => {});
            if (lastHandledRoomIdRef.current) {
              dismissCallNotification(lastHandledRoomIdRef.current).catch(() => {});
            }
          }
          lastHandledRoomIdRef.current = null;
          return;
        }

        // Stale call (> 45s) — clean up and ignore
        if (incoming.ts && Date.now() - incoming.ts > 45_000) {
          deleteIncoming(user.uid).catch(() => {});
          if (Platform.OS === 'android') {
            dismissNativeIncomingCall().catch(() => {});
            if (incoming.roomId) {
              dismissCallNotification(incoming.roomId).catch(() => {});
            }
          }
          return;
        }

        const segs = segmentsRef.current as string[];
        const inCall = segs.some((s) => s === '(call)' || s === 'incoming' || s === 'active');
        if (inCall) {
          // If we are already handling or participating in this room, or currently in any active call, do NOT disrupt
          if (lastHandledRoomIdRef.current === incoming.roomId) {
            return;
          }
          console.log('[Layout] User is already in a call, ignoring conflicting incoming call:', incoming.roomId);
          return;
        }

        lastHandledRoomIdRef.current = incoming.roomId;

        // On Android: Trigger system native CallStyle notification (authentic green Answer & red Decline buttons)
        if (Platform.OS === 'android') {
          showNativeIncomingCall({
            roomId: incoming.roomId,
            callerName: incoming.callerName,
            video: incoming.video,
            durationSec: incoming.durationSec,
            calleeUid: user.uid,
          }).catch((err) => {
            console.warn('[NativeCall] showIncomingCall error:', err);
          });
        }

        // Show OS-level notification on Web if tab is backgrounded or notifications are enabled
        if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready?.then((reg) => {
            const minutes = Math.round((incoming.durationSec || 300) / 60);
            reg.showNotification(`Incoming ${incoming.video ? 'Video' : 'Voice'} Call`, {
              body: `${incoming.callerName} is calling you (${minutes}m limit)`,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: `incoming-call-${incoming.roomId}`,
              renotify: true,
              requireInteraction: true,
              data: {
                roomId: incoming.roomId,
                callerName: incoming.callerName,
                video: incoming.video,
                durationSec: incoming.durationSec,
              },
              actions: [
                { action: 'accept', title: 'Accept' },
                { action: 'decline', title: 'Decline' },
              ],
            } as any).catch(() => {});
          });
        }

        // If app is currently active in foreground, route immediately to incoming screen
        if (AppState.currentState === 'active') {
          router.push({
            pathname: '/(call)/incoming',
            params: {
              roomId: incoming.roomId,
              callerName: incoming.callerName,
              video: String(incoming.video),
              durationSec: String(incoming.durationSec),
            },
          });
        }
      });
    };

    const detach = () => {
      unwatch?.();
      unwatch = undefined;
    };

    // Attach and keep listening while user is authenticated (do not detach on Android background)
    attach();

    return () => {
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

    // Check native Android initial call action (e.g. launched via Green Answer button)
    getInitialCallAction().then((initial) => {
      if (!initial || !initial.roomId) return;
      lastHandledRoomIdRef.current = initial.roomId;
      deleteIncoming(user.uid).catch(() => {});
      dismissNativeIncomingCall().catch(() => {});
      if (initial.action === 'answer') {
        router.replace({
          pathname: '/(call)/active',
          params: {
            roomId: initial.roomId,
            role: 'callee',
            contactName: initial.callerName || 'Caller',
            video: String(initial.video ?? false),
            durationSec: String(initial.durationSec ?? 300),
          },
        });
      } else if (initial.action === 'incoming') {
        router.push({
          pathname: '/(call)/incoming',
          params: {
            roomId: initial.roomId,
            callerName: initial.callerName || 'Caller',
            video: String(initial.video ?? false),
            durationSec: String(initial.durationSec ?? 300),
          },
        });
      }
    }).catch(() => {});

    // Listen to native CallStyle broadcast actions (Answer / Decline / Notification Click)
    const unsubNativeCallAction = subscribeCallAction((event) => {
      if (event.action === 'answer' && event.roomId) {
        lastHandledRoomIdRef.current = event.roomId;
        if (user?.uid) deleteIncoming(user.uid).catch(() => {});
        dismissNativeIncomingCall().catch(() => {});
        router.replace({
          pathname: '/(call)/active',
          params: {
            roomId: event.roomId,
            role: 'callee',
            contactName: event.callerName || 'Caller',
            video: String(event.video ?? false),
            durationSec: String(event.durationSec ?? 300),
          },
        });
      } else if (event.action === 'incoming' && event.roomId) {
        const segs = segmentsRef.current as string[];
        const inCall = segs.some((s) => s === '(call)' || s === 'incoming' || s === 'active');
        if (inCall) {
          return;
        }
        lastHandledRoomIdRef.current = event.roomId;
        router.push({
          pathname: '/(call)/incoming',
          params: {
            roomId: event.roomId,
            callerName: event.callerName || 'Caller',
            video: String(event.video ?? false),
            durationSec: String(event.durationSec ?? 300),
          },
        });
      } else if (event.action === 'decline' && event.roomId) {
        const uid = user?.uid || event.calleeUid || '';
        if (uid) {
          setCallState(event.roomId, 'declined', { endedBy: uid }).catch(() => {});
          deleteIncoming(uid).catch(() => {});
        }
        const apiUrl = Platform.OS === 'web' ? '/api' : (process.env.EXPO_PUBLIC_API_URL ?? '') + '/api';
        fetch(`${apiUrl}/calls/decline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: event.roomId, calleeUid: uid }),
        }).catch(() => {});
        dismissNativeIncomingCall().catch(() => {});
      }
    });

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
          setCallState(data.roomId, 'declined', { endedBy: user.uid }).catch(() => {});
          deleteIncoming(user.uid).catch(() => {});
          notifee.cancelNotification(detail.notification.id).catch(() => {});
        }
      }
    });

    return () => {
      unsubNativeCallAction();
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
