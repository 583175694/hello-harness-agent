import { describe, expect, it } from 'vitest';

import { maskEmail, maskPhone, normalizeEmail, normalizePhone, tryNormalizePhone } from '../../../src/auth/auth.normalize';

describe('auth.normalize', () => {
  it('normalizes email case and whitespace', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('normalizes mainland phone to 11 digits without country code', () => {
    expect(normalizePhone('13800138000')).toBe('13800138000');
    expect(normalizePhone('+86 138 0013 8000')).toBe('13800138000');
    expect(normalizePhone('8613800138000')).toBe('13800138000');
    expect(tryNormalizePhone('12345')).toBeUndefined();
  });

  it('masks email and phone for display', () => {
    expect(maskEmail('user@example.com')).toBe('us***@example.com');
    expect(maskPhone('+8613800138000')).toBe('138****8000');
    expect(maskPhone('13800138000')).toBe('138****8000');
  });
});
