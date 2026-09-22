import { randomInt } from 'crypto';
import { CODE_ALPHABET, CODE_LENGTH } from './code';

/**
 * Generates a cryptographically secure random 10-char code string.
 * Uses rejection sampling to eliminate modulo bias.
 * Only call this on the server (Node.js) where `crypto` is available.
 */
export function generateCodeRaw(): string {
  const alphabetLen = CODE_ALPHABET.length; // 19
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_ALPHABET[randomInt(0, alphabetLen)];
  }
  return result;
}

/**
 * Attempts to generate a unique code, retrying on collision.
 * `claimCode` should do an atomic Firestore create (fails on ALREADY_EXISTS).
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
