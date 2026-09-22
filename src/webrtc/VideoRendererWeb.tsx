import React, { useRef, useEffect } from 'react';

interface VideoRendererWebProps {
  streamURL?: string;
  stream?: MediaStream;
  mirror?: boolean;
  style?: React.CSSProperties;
}

/**
 * Web video renderer — wraps a <video> element to play a MediaStream.
 */
export function VideoRendererWeb({
  stream,
  mirror = false,
  style,
}: VideoRendererWebProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;

    el.muted = true; // explicitly set property to satisfy browser autoplay policy
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const playVideo = () => {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch((err) => {
        if (err?.name === 'AbortError') {
          return;
        }
        console.warn('[WebRTC VideoWeb] Auto-play blocked, waiting for user gesture:', err);
        const unlock = () => {
          el.play().catch(() => {});
          window.removeEventListener('click', unlock);
          window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
      });
    };

    playVideo();

    const handleTrackAdded = (e: any) => {
      console.log('[WebRTC VideoWeb] Track added to stream:', e.track?.kind);
      if (e.track?.kind === 'video') {
        el.srcObject = null;
        el.srcObject = stream;
      }
      playVideo();
    };

    if (typeof stream.addEventListener === 'function') {
      stream.addEventListener('addtrack', handleTrackAdded);
      stream.addEventListener('removetrack', playVideo);
      return () => {
        stream.removeEventListener('addtrack', handleTrackAdded);
        stream.removeEventListener('removetrack', playVideo);
      };
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={true} // ALWAYS mute video elements — audio is played through RemoteAudioWeb
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: mirror ? 'scaleX(-1)' : undefined,
        ...style,
      }}
    />
  );
}
