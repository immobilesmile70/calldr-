/**
 * Native WebRTC adapter (react-native-webrtc)
 *
 * Exports the same interface as index.web.ts so the rest of the app
 * can import from '@/webrtc' without platform-specific imports.
 */
export {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  mediaDevices as getUserMedia,
} from 'react-native-webrtc';

export { RTCView as VideoRenderer } from 'react-native-webrtc';

/** Get user media (camera + mic) — wraps react-native-webrtc's mediaDevices */
import { mediaDevices } from 'react-native-webrtc';

export interface MediaConstraints {
  audio: boolean;
  video: boolean | { width: number; height: number; frameRate: number; facingMode: string };
}

export async function getLocalStream(video: boolean): Promise<MediaStream> {
  const constraints: MediaConstraints = {
    audio: true,
    video: video
      ? {
          width: 640,
          height: 360,
          frameRate: 24,
          facingMode: 'user',
        }
      : false,
  };
  const stream = await mediaDevices.getUserMedia(constraints as Parameters<typeof mediaDevices.getUserMedia>[0]);
  return stream as unknown as MediaStream;
}

/** Flip camera (front ↔ back) */
export async function flipCamera(stream: MediaStream): Promise<void> {
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && '_switchCamera' in videoTrack) {
    // react-native-webrtc adds _switchCamera
    (videoTrack as unknown as { _switchCamera: () => void })._switchCamera();
  }
}
