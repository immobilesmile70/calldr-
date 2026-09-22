import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { AuthContext, useAuthProvider } from '@/lib/useAuth';
import { watchIncoming } from '@/firebase/rtdb';
import { router } from 'expo-router';

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

  // Hide splash once fonts + auth are resolved
  useEffect(() => {
    if (!loading && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading, fontsLoaded]);

  // Route guard
  useEffect(() => {
    if (loading || !fontsLoaded) return;

    if (!user) {
      router.replace('/');
      return;
    }

    if (userDoc && !userDoc.onboarded) {
      router.replace('/(onboarding)/username');
      return;
    }

    if (userDoc?.onboarded) {
      router.replace('/(main)/home');
    }
  }, [user, userDoc, loading, fontsLoaded]);

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
