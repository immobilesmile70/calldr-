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
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch((err) => {
        console.warn('[WebRTC VideoWeb] Auto-play failed, retrying on user interaction:', err);
      });
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
