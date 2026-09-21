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

// ─── Server-side generator (Node.js only) ────────────────────────────────────

/**
 * Generates a cryptographically secure random 10-char code string.
 * Uses rejection sampling to eliminate modulo bias.
 * Only call this on the server (Node.js) where `crypto` is available.
 */
export function generateCodeRaw(): string {
  // Dynamic require so this module is importable on the client too.
  // On the client, this function should never be called.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomInt } = require('crypto') as typeof import('crypto');
  const alphabetLen = CODE_ALPHABET.length; // 19
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_ALPHABET[randomInt(0, alphabetLen)];
  }
  return result;
}

/**
 * Attempts to generate a unique code, retrying on collision.
 * `existsCheck` should do an atomic Firestore create (fails on ALREADY_EXISTS).
 *
 * Returns the raw (unformatted) code that was successfully claimed.
 * Throws if max retries exceeded.
 */
export async function generateUniqueCode(
  claimCode: (raw: string) => Promise<boolean>,
  maxRetries = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const raw = generateCodeRaw();
    const claimed = await claimCode(raw);
    if (claimed) return raw;
  }
  throw new Error('Failed to generate unique code after max retries');
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
