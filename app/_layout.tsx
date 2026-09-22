import React, { useEffect } from 'react';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { AuthContext, useAuthProvider } from '@/lib/useAuth';
import { watchIncoming } from '@/firebase/rtdb';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout:
 * - Provides auth context
 * - Guards routes by auth state + onboarding flag
 * - Attaches RTDB incoming listener when app is foreground
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

  // RTDB incoming call listener (foreground only)
  useEffect(() => {
    if (!user) return;
    if (Platform.OS === 'web') return; // web uses RTDB listener on home screen

    let unwatch: (() => void) | undefined;

    const attach = () => {
      unwatch = watchIncoming(user.uid, (incoming) => {
        if (incoming && incoming.roomId) {
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

    // Attach when active, detach when backgrounded
    if (AppState.currentState === 'active') attach();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attach();
      else detach();
    });

    return () => {
      sub.remove();
      detach();
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
