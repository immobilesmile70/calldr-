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
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={mirror} // mute local preview to avoid echo
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
