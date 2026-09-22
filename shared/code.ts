/**
 * CalLdr short-code utilities.
 *
 * Format:  xxx-xxxx-xxx  (3-4-3, total 10 base chars)
 * Alphabet: bcdfghjkmnpqrstvwxz  (19 consonants — no vowels, no lookalikes)
 * Space:   19^10 ≈ 6.1e12
 *
 * Server-side: uses Node crypto.randomInt (CSPRNG, no modulo bias).
 * Client-side: uses Math.random fallback for display/normalizer only —
 *   code generation ALWAYS happens server-side.
 */

/** 19-consonant alphabet with no vowels and no lookalike characters */
export const CODE_ALPHABET = 'bcdfghjkmnpqrstvwxz';
export const CODE_LENGTH = 10;
export const CODE_SEGMENTS = [3, 4, 3] as const;

/**
 * Normalizes raw user input into a 10-char lowercase consonant string.
 * Strips hyphens, spaces, and any chars not in the alphabet.
 * Returns null if the result is not exactly 10 valid characters.
 */
export function normalizeCode(raw: string): string | null {
  const stripped = raw
    .toLowerCase()
    .replace(/[^bcdfghjkmnpqrstvwxz]/g, '');

  if (stripped.length !== CODE_LENGTH) return null;
  return stripped;
}

/**
 * Formats a 10-char code string as xxx-xxxx-xxx.
 * Throws if the input is not exactly 10 valid chars.
 */
export function formatCode(raw: string): string {
  const clean = normalizeCode(raw);
  if (!clean) throw new Error(`Invalid code: "${raw}"`);
  return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 10)}`;
}

/**
 * Validates a raw string (with or without hyphens) is a valid CalLdr code.
 */
export function isValidCode(raw: string): boolean {
  return normalizeCode(raw) !== null;
}



/**
 * Computes `endsAt` timestamp from server-side `answeredAt` and `durationSec`.
 * Both clients use this with RTDB `.info/serverTimeOffset` so they agree.
 */
export function computeEndsAt(answeredAt: number, durationSec: number): number {
  return answeredAt + durationSec * 1000;
}

/**
 * Returns milliseconds remaining until `endsAt`.
 * Clamps to 0 — never returns negative.
 */
export function msRemaining(endsAt: number, nowMs: number): number {
  return Math.max(0, endsAt - nowMs);
}
