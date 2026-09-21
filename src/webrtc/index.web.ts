/**
 * Web WebRTC adapter (browser APIs)
 *
 * Exports the same interface as index.native.ts.
 */

export const RTCPeerConnection = window.RTCPeerConnection;
export const RTCSessionDescription = window.RTCSessionDescription;
export const RTCIceCandidate = window.RTCIceCandidate;

export type RTCPeerConnectionConfiguration = RTCConfiguration;
export type MediaStreamConstraints = globalThis.MediaStreamConstraints;

/** Video renderer — returns a ref-based component using <video> element */
export { VideoRendererWeb as VideoRenderer } from './VideoRendererWeb';

export interface MediaConstraints {
  audio: boolean;
  video: boolean | { width: number; height: number; frameRate: number; facingMode: string };
}

export async function getLocalStream(video: boolean): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: true,
    video: video
      ? {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24 },
          facingMode: 'user',
        }
      : false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** Flip camera not natively available on web */
export async function flipCamera(_stream: MediaStream): Promise<void> {
  console.warn('[WebRTC Web] flipCamera not supported in browser');
}
