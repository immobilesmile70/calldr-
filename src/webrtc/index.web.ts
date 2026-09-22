/**
 * Web WebRTC adapter (browser APIs)
 *
 * Exports the same interface as index.native.ts.
 */

export const RTCPeerConnection = typeof window !== 'undefined' ? window.RTCPeerConnection : (null as any);
export const RTCSessionDescription = typeof window !== 'undefined' ? window.RTCSessionDescription : (null as any);
export const RTCIceCandidate = typeof window !== 'undefined' ? window.RTCIceCandidate : (null as any);
export const MediaStream = typeof window !== 'undefined' ? window.MediaStream : (null as any);

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
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24 },
          facingMode: 'user',
        }
      : false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (video) {
      console.warn('[WebRTC Web] Ideal video constraints failed, retrying with basic { audio: true, video: true }:', err);
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    }
    throw err;
  }
}

let currentFacingMode: 'user' | 'environment' = 'user';

/** Flip camera on web (front ↔ back) */
export async function flipCamera(stream: MediaStream): Promise<void> {
  try {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentFacingMode } },
    });
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    const oldTrack = stream.getVideoTracks()[0];
    if (oldTrack) {
      oldTrack.stop();
      stream.removeTrack(oldTrack);
    }
    stream.addTrack(newTrack);
  } catch (err) {
    console.warn('[WebRTC Web] flipCamera error:', err);
  }
}
