# CalLdr

> Call with a limit. No more, no less.

Minimalist Android-first audio/video calling app on WebRTC. Add contacts by a short code. Tap a contact, pick a duration, call. The call auto-ends when time runs out.

## Stack

- **Mobile**: Expo SDK 52, React Native, TypeScript, expo-router, EAS custom dev build
- **WebRTC**: react-native-webrtc (native) + browser WebRTC (web)
- **Backend**: Vercel serverless functions (Node.js)
- **Database**: Firebase Auth + Firestore + Realtime Database + FCM

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/immobilesmile70/calldr-.git
cd calldr-
npm install --legacy-peer-deps
```

### 2. Set up environment

```bash
cp .env.example .env
# Fill in EXPO_PUBLIC_API_URL and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
# Add server-side vars to Vercel dashboard
```

### 3. Firebase setup

- Enable **Email/Password** and **Google** sign-in providers in Firebase Console
- Enable **Realtime Database** (start in test mode, then deploy `database.rules.json`)
- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Deploy RTDB rules: `firebase deploy --only database`
- Download `google-services.json` from Firebase Console → place in project root

### 4. Build for Android

```bash
npm run prebuild:android     # Generate Android folder
eas build -p android --profile development
```

### 5. Run web

```bash
npm run build:web   # Builds to dist/ — deploy to Vercel
```

## Project Structure

```
app/                  expo-router screens
  _layout.tsx         Root layout (auth guard, fonts, RTDB listener)
  index.tsx           Landing screen
  (auth)/             Login, signup, forgot
  (onboarding)/       Username setup
  (main)/             Home, settings
  (call)/             Incoming, active call screens
src/
  ui/                 Design system components
  theme/              Tokens + shared styles
  firebase/           Firebase clients (auth, firestore, rtdb, fcm)
  webrtc/             Platform adapters + peer connection logic
  calls/              Call hooks (room, timer, signaling, media)
  notifications/      FCM + notifee handlers
  lib/                useAuth, useConnections
api/
  auth/[action].ts    signup, login, forgot, google
  profile/[action].ts username, regenerate-code, fcm-token
  connections/[action].ts request, respond, remove
  calls/[action].ts   invite, cancel, ice
  _lib/admin.ts       Shared firebase-admin + helpers
shared/
  types.ts            Domain types
  code.ts             Code generator/normalizer/formatter
  code.test.ts        Unit tests
```

## Manual Steps Checklist

- [ ] Enable Email/Password + Google providers in Firebase Auth console
- [ ] Enable Realtime Database in Firebase console
- [ ] Enable FCM in Firebase project settings
- [ ] Deploy `firestore.rules`: `firebase deploy --only firestore:rules`
- [ ] Deploy `database.rules.json`: `firebase deploy --only database`
- [ ] Download `google-services.json` → place at project root
- [ ] Register EAS keystore SHA-1 in Firebase for Google Sign-In
- [ ] Set Vercel environment variables (see `.env.example`)
- [ ] Provide TURN credentials (TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL) — required for reliable calls on cellular/strict NATs
- [ ] Run `eas build -p android --profile development`
- [ ] Update `EXPO_PUBLIC_API_URL` in `.env` to your Vercel deployment URL

## Defaults

| Decision | Default |
|---|---|
| Expo SDK | 52 |
| expo-router | 4 |
| Notification lib | @notifee/react-native |
| WebRTC version | react-native-webrtc 124.0.4 (Expo 52 compatible) |
| STUN fallback | stun.l.google.com:19302 |
| Code format | `xxx-xxxx-xxx` (10 consonants, no vowels) |
| Auth | Custom token (server issues, client signs in) |
| Display font | Ogg-Medium (provided) |
| Body font | DM Sans (Google Fonts — web; system font on native) |
| Code font | JetBrains Mono |
