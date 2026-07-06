import { describe, expect, it } from 'vitest';
import {
  BASE_URL_ERROR_MALFORMED,
  BASE_URL_ERROR_NON_HTTPS,
  BASE_URL_ERROR_USERINFO,
  LABEL_ERROR_TOO_LONG,
  validateBaseUrl,
  validateLabel
} from '@libs/providers/validation.ts';

describe('validateBaseUrl', () => {
  it('accepts https URLs and trims trailing slashes', () => {
    expect(validateBaseUrl(' https://api.example.com/v1/ ')).toEqual({
      ok: true,
      value: 'https://api.example.com/v1'
    });
  });

  it('rejects non-https URLs', () => {
    expect(validateBaseUrl('http://api.example.com/v1')).toMatchObject({
      ok: false,
      error: BASE_URL_ERROR_NON_HTTPS
    });
  });

  it('rejects embedded userinfo', () => {
    expect(validateBaseUrl('https://user:pass@host/v1')).toMatchObject({
      ok: false,
      error: BASE_URL_ERROR_USERINFO
    });
  });

  it('rejects malformed URLs', () => {
    expect(validateBaseUrl('not a url')).toMatchObject({
      ok: false,
      error: BASE_URL_ERROR_MALFORMED
    });
  });
});

describe('validateLabel', () => {
  it('trims labels and treats empty as absent', () => {
    expect(validateLabel('  Work endpoint  ')).toEqual({ ok: true, value: 'Work endpoint' });
    expect(validateLabel('   ')).toEqual({ ok: true, value: null });
  });

  it('caps label length', () => {
    expect(validateLabel('abcd', 3)).toMatchObject({ ok: false, error: LABEL_ERROR_TOO_LONG });
  });
});
