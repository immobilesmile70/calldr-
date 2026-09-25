import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';

const { PipModule } = NativeModules;

/**
 * Enable or disable automatic Android Picture-in-Picture when user swipes up or presses Home.
 */
export async function enableAutoPip(enable: boolean): Promise<boolean> {
  if (Platform.OS !== 'android' || !PipModule?.enableAutoPip) return false;
  try {
    return await PipModule.enableAutoPip(enable);
  } catch {
    return false;
  }
}

/**
 * Manually trigger Android Picture-in-Picture mode.
 */
export async function enterPip(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PipModule?.enterPip) return false;
  try {
    return await PipModule.enterPip();
  } catch {
    return false;
  }
}

/**
 * Subscribe to Android Picture-in-Picture status changes.
 * Returns unsubscribe function.
 */
export function subscribePipStatus(callback: (isInPip: boolean) => void): () => void {
  if (Platform.OS !== 'android') return () => {};
  const sub = DeviceEventEmitter.addListener('onPictureInPictureStatusChanged', callback);
  return () => {
    sub.remove();
  };
}
