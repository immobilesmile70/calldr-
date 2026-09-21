import React, { useCallback, forwardRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { PillInput } from './PillInput';
import { normalizeCode, formatCode } from '@shared/code';

interface CodeInputProps
  extends Omit<TextInputProps, 'onChangeText' | 'value' | 'style'> {
  value: string;
  onChangeCode: (raw: string, formatted: string, valid: boolean) => void;
  label?: string;
  error?: string;
}

/**
 * Smart code input:
 * - Auto-lowercases
 * - Strips invalid chars (consonants-only alphabet)
 * - Auto-formats with hyphens as user types (xxx-xxxx-xxx)
 * - Tolerates pasted text with or without hyphens
 * - Reports raw (10-char) + formatted + validity to parent
 */
export const CodeInput = forwardRef<TextInput, CodeInputProps>(
  ({ value, onChangeCode, label = 'Friend\'s code', error, ...rest }, ref) => {
    const handleChange = useCallback(
      (text: string) => {
        // Normalize: lowercase, strip non-alphabet chars (hyphens + invalid)
        const raw = text.toLowerCase().replace(/[^bcdfghjkmnpqrstvwxz]/g, '');
        // Clamp to 10 chars
        const clamped = raw.slice(0, 10);

        let formatted = clamped;
        try {
          if (clamped.length === 10) {
            formatted = formatCode(clamped);
          } else {
            // Partial formatting as the user types
            if (clamped.length > 3) {
              formatted = clamped.slice(0, 3) + '-' + clamped.slice(3);
            }
            if (clamped.length > 7) {
              formatted =
                clamped.slice(0, 3) +
                '-' +
                clamped.slice(3, 7) +
                '-' +
                clamped.slice(7);
            }
          }
        } catch {
          formatted = clamped;
        }

        const normalized = normalizeCode(clamped);
        onChangeCode(clamped, formatted, normalized !== null);
      },
      [onChangeCode],
    );

    return (
      <PillInput
        ref={ref}
        label={label}
        value={value}
        onChangeText={handleChange}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        maxLength={12} // xxx-xxxx-xxx = 12 chars with hyphens
        placeholder="xxx-xxxx-xxx"
        {...rest}
      />
    );
  },
);

CodeInput.displayName = 'CodeInput';
