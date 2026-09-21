/**
 * Platform-agnostic WebRTC barrel export.
 * Metro resolves to index.native.ts on Android/iOS and index.web.ts on web.
 *
 * Import from this file everywhere in the app:
 *   import { getLocalStream, flipCamera } from '@/webrtc/index';
 */
export * from './index.native';
