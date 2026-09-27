import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

const { CallNotificationModule } = NativeModules;
const callEventEmitter =
  Platform.OS === 'android' && CallNotificationModule
    ? new NativeEventEmitter(CallNotificationModule)
    : null;

export interface IncomingCallOptions {
  roomId: string;
  callerName: string;
  video: boolean;
  durationSec: number;
  calleeUid?: string;
}

export interface OngoingCallOptions {
  contactName: string;
  video: boolean;
  startTimeMs?: number;
  roomId?: string;
}

export interface NativeCallAction {
  action: 'answer' | 'decline' | 'hangup' | 'incoming';
  roomId: string;
  callerName?: string;
  video?: boolean;
  durationSec?: number;
  calleeUid?: string;
}

/**
 * Display the Android System Native CallStyle Incoming Call Notification.
 * Renders the authentic Green Answer and Red Decline circular buttons,
 * loops ringtone, and triggers heads-up banner / lockscreen UI.
 */
export async function showNativeIncomingCall(options: IncomingCallOptions): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.showIncomingCall(options);
  } catch (err) {
    console.warn('[NativeCall] showIncomingCall failed:', err);
  }
}

/**
 * Display the Android System Native CallStyle Ongoing Call Notification.
 * Activates the status bar call chip with live ticking chronometer timer,
 * and renders the Red Hang Up button.
 */
export async function showNativeOngoingCall(options: OngoingCallOptions): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    const validStartTime =
      typeof options.startTimeMs === 'number' && !isNaN(options.startTimeMs) && options.startTimeMs > 0
        ? options.startTimeMs
        : Date.now();
    await CallNotificationModule.showOngoingCall({
      ...options,
      startTimeMs: validStartTime,
    });
  } catch (err) {
    console.warn('[NativeCall] showOngoingCall failed:', err);
  }
}

/** Dismiss incoming call notification */
export async function dismissNativeIncomingCall(): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.dismissIncomingCall();
  } catch {
    // ignore
  }
}

/** Dismiss ongoing call notification */
export async function dismissNativeOngoingCall(): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.dismissOngoingCall();
  } catch {
    // ignore
  }
}

/** Dismiss all call notifications and stop tones */
export async function dismissAllNativeCallNotifications(): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.dismissAllCallNotifications();
  } catch {
    // ignore
  }
}

/**
 * Start telephony supervisory ringback tone ("bzzrrr... bzzrrr...")
 * using Android ToneGenerator on STREAM_VOICE_CALL.
 * Leaves in-communication audio session undisturbed.
 */
export async function startNativeRingback(): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.startRingbackTone();
  } catch (err) {
    console.warn('[NativeCall] startRingbackTone failed:', err);
  }
}

/** Stop native ringback tone */
export async function stopNativeRingback(): Promise<void> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return;
  try {
    await CallNotificationModule.stopRingbackTone();
  } catch {
    // ignore
  }
}

/** Check if the app was launched by tapping Answer on an incoming notification */
export async function getInitialCallAction(): Promise<NativeCallAction | null> {
  if (Platform.OS !== 'android' || !CallNotificationModule) return null;
  try {
    const action = await CallNotificationModule.getInitialCallAction();
    return action as NativeCallAction | null;
  } catch {
    return null;
  }
}

/** Subscribe to notification actions (Answer, Decline, Hangup) */
export function subscribeCallAction(
  callback: (action: NativeCallAction) => void,
): () => void {
  if (!callEventEmitter) return () => {};
  const sub = callEventEmitter.addListener('onCallAction', callback);
  return () => {
    sub.remove();
  };
}
