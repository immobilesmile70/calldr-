import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { Platform } from 'react-native';

const rawDbUrl = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://calldr-default-rtdb.asia-southeast1.firebasedatabase.app';
const databaseURL = rawDbUrl.includes('firebaseio.com') && !rawDbUrl.includes('asia-southeast1')
  ? 'https://calldr-default-rtdb.asia-southeast1.firebasedatabase.app'
  : rawDbUrl;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCRo04A2e91w6s9L9SKSRCNvFU7jgoDdKw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'calldr.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'calldr',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'calldr.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '81815584283',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:81815584283:android:a8a548982d053e24c102be',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-0R40K0X5KH',
  databaseURL,
};

let app: FirebaseApp;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export { app };
export { Platform };
