import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CalLdr',
  slug: 'calldr',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'calldr',
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0E0E11',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0E0E11',
    },
    package: 'com.calldr.app',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.WAKE_LOCK',
      'android.permission.VIBRATE',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  experiments: {
    typedRoutes: true,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0E0E11',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          targetSdkVersion: 34,
          compileSdkVersion: 35,
        },
      },
    ],
    '@config-plugins/react-native-webrtc',
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    [
      'expo-font',
      {
        fonts: ['./public/Ogg-Medium.ttf'],
      },
    ],
  ],
  extra: {
    router: { origin: false },
    eas: {
        projectId: "e666a19a-3cca-486f-9ccf-a36582997663"
      }
  },
  owner: "beastdora",
});
