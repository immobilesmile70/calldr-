import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Procedural telephony tone generator using Web Audio API.
 * Generates standard telephone tones without external MP3 dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// Active tone nodes tracking
let activeRingbackInterval: ReturnType<typeof setInterval> | null = null;
let activeIncomingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start Outgoing Ringback Tone:
 * Standard 440 Hz + 480 Hz dual-frequency tone with 1.5s on, 2.5s off cadence.
 */
export function startRingbackTone(): void {
  stopRingbackTone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playPulse = () => {
    try {
      const now = ctx.currentTime;

      // 440 Hz sine wave (US/UK standard)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);

      // 480 Hz sine wave
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      // Gain envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 1.45);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.55);
      osc2.stop(now + 1.55);
    } catch {
      // ignore
    }
  };

  playPulse();
  activeRingbackInterval = setInterval(playPulse, 4000);
}

/** Stop Outgoing Ringback Tone */
export function stopRingbackTone(): void {
  if (activeRingbackInterval) {
    clearInterval(activeRingbackInterval);
    activeRingbackInterval = null;
  }
}

/**
 * Start Incoming Ringtone:
 * Musical chime chord repeating every 3 seconds.
 */
export function startIncomingRingtone(): void {
  stopIncomingRingtone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playChime = () => {
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.75);
      });
    } catch {
      // ignore
    }
  };

  playChime();
  activeIncomingInterval = setInterval(playChime, 3000);
}

/** Stop Incoming Ringtone */
export function stopIncomingRingtone(): void {
  if (activeIncomingInterval) {
    clearInterval(activeIncomingInterval);
    activeIncomingInterval = null;
  }
}

/**
 * Play Call Pickup / Connected Chime:
 * Pleasant ascending two-tone confirmation.
 */
export function playPickupChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const chords = [587.33, 880]; // D5, A5

    chords.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);

      gain.gain.setValueAtTime(0.001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.4);
    });
  } catch {
    // ignore
  }
}

/**
 * Play Call Ended Soft Cut Beep:
 * Downward soft tone signifying hang-up.
 */
export function playCutBeep(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // ignore
  }
}

/**
 * Play Network Warning Double-Beep:
 * Soft low beep indicating connection instability.
 */
export function playNetworkWarningBeep(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    [0, 0.16].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now + offset);

      gain.gain.setValueAtTime(0.08, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  } catch {
    // ignore
  }
}

/** Stop all running telephony tones */
export function stopAllCallSounds(): void {
  stopRingbackTone();
  stopIncomingRingtone();
}

// ── Haptics Helpers ─────────────────────────────────────────────────────────

export async function hapticPickup(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([40, 60, 80]);
    }
  } catch {
    // ignore
  }
}

export async function hapticCameraSwitch(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(25);
    }
  } catch {
    // ignore
  }
}

export async function hapticCallCut(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([50, 40, 50]);
    }
  } catch {
    // ignore
  }
}

export async function hapticWheelTick(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.selectionAsync();
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // ignore
  }
}
