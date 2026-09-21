import {
  CODE_ALPHABET,
  CODE_LENGTH,
  normalizeCode,
  formatCode,
  isValidCode,
  generateCodeRaw,
  computeEndsAt,
  msRemaining,
  generateUniqueCode,
} from './code';

// ── normalizeCode ────────────────────────────────────────────────────────────

describe('normalizeCode', () => {
  it('returns null for empty string', () => {
    expect(normalizeCode('')).toBeNull();
  });

  it('strips hyphens and normalizes to lowercase', () => {
    const result = normalizeCode('bcd-fghj-kmn');
    expect(result).toBe('bcdfghjkkmn'.slice(0, 10));
  });

  it('strips vowels and returns null if length is wrong after strip', () => {
    // "aeiou" all stripped, leaving empty
    expect(normalizeCode('aeiouaeiou')).toBeNull();
  });

  it('returns the raw 10-char string when already clean', () => {
    const valid = CODE_ALPHABET.slice(0, CODE_LENGTH);
    expect(normalizeCode(valid)).toBe(valid);
  });

  it('returns null for strings shorter than 10 valid chars', () => {
    expect(normalizeCode('bcd')).toBeNull();
  });

  it('returns null for strings longer than 10 valid chars', () => {
    expect(normalizeCode('bcdfghjkmnpqrst')).toBeNull();
  });

  it('strips spaces', () => {
    const withSpaces = 'bcd fghj km';
    const result = normalizeCode(withSpaces);
    expect(result).toBe('bcdfghjkkm'.slice(0, 10));
  });
});

// ── formatCode ───────────────────────────────────────────────────────────────

describe('formatCode', () => {
  const validRaw = 'bcdfghjkmn';

  it('formats as xxx-xxxx-xxx', () => {
    expect(formatCode(validRaw)).toBe('bcd-fghj-kmn');
  });

  it('throws on invalid input', () => {
    expect(() => formatCode('abc')).toThrow();
  });

  it('handles hyphened input (normalizes first)', () => {
    expect(formatCode('bcd-fghj-kmn')).toBe('bcd-fghj-kmn');
  });
});

// ── isValidCode ──────────────────────────────────────────────────────────────

describe('isValidCode', () => {
  it('returns true for a valid formatted code', () => {
    expect(isValidCode('bcd-fghj-kmn')).toBe(true);
  });

  it('returns true for a valid raw code', () => {
    expect(isValidCode('bcdfghjkmn')).toBe(true);
  });

  it('returns false for a code with vowels', () => {
    expect(isValidCode('abcdefghij')).toBe(false);
  });

  it('returns false for too-short input', () => {
    expect(isValidCode('bcd')).toBe(false);
  });
});

// ── generateCodeRaw ──────────────────────────────────────────────────────────

describe('generateCodeRaw', () => {
  it('generates a string of exactly CODE_LENGTH characters', () => {
    const code = generateCodeRaw();
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('only contains alphabet characters', () => {
    const code = generateCodeRaw();
    for (const char of code) {
      expect(CODE_ALPHABET).toContain(char);
    }
  });

  it('generates different codes on successive calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCodeRaw()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ── generateUniqueCode ───────────────────────────────────────────────────────

describe('generateUniqueCode', () => {
  it('returns a code when claimCode succeeds on first try', async () => {
    const claimCode = jest.fn().mockResolvedValue(true);
    const code = await generateUniqueCode(claimCode);
    expect(claimCode).toHaveBeenCalledTimes(1);
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('retries when claimCode returns false (collision)', async () => {
    const claimCode = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const code = await generateUniqueCode(claimCode);
    expect(claimCode).toHaveBeenCalledTimes(3);
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('throws after max retries exceeded', async () => {
    const claimCode = jest.fn().mockResolvedValue(false);
    await expect(generateUniqueCode(claimCode, 5)).rejects.toThrow(
      'Failed to generate unique code after max retries',
    );
    expect(claimCode).toHaveBeenCalledTimes(5);
  });
});

// ── computeEndsAt & msRemaining ──────────────────────────────────────────────

describe('computeEndsAt', () => {
  it('returns answeredAt + durationSec * 1000', () => {
    expect(computeEndsAt(1_000_000, 300)).toBe(1_300_000);
    expect(computeEndsAt(0, 60)).toBe(60_000);
  });
});

describe('msRemaining', () => {
  it('returns positive ms when time remains', () => {
    expect(msRemaining(1_000, 500)).toBe(500);
  });

  it('clamps to 0 when time has passed', () => {
    expect(msRemaining(1_000, 2_000)).toBe(0);
  });

  it('returns 0 exactly at endsAt', () => {
    expect(msRemaining(1_000, 1_000)).toBe(0);
  });
});
