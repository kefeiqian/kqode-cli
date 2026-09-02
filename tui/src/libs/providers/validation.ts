import type { ProviderHelperResult } from '@libs/providers/result.ts';

/** URL parse failed before scheme/userinfo checks could run. */
export const BASE_URL_ERROR_MALFORMED = 'malformed';

/** Parsed URL did not use the HTTPS scheme. */
export const BASE_URL_ERROR_NON_HTTPS = 'nonHttps';

/** Parsed URL included embedded username or password userinfo. */
export const BASE_URL_ERROR_USERINFO = 'userinfo';

/** Provider label exceeded the configured display length cap. */
export const LABEL_ERROR_TOO_LONG = 'tooLong';

/** Default maximum length for an optional provider display label. */
export const DEFAULT_MAX_PROVIDER_LABEL_LENGTH = 64;

/** Typed base URL validation error tags. */
export type BaseUrlValidationError =
  | typeof BASE_URL_ERROR_MALFORMED
  | typeof BASE_URL_ERROR_NON_HTTPS
  | typeof BASE_URL_ERROR_USERINFO;

/** Typed provider label validation error tags. */
export type LabelValidationError = typeof LABEL_ERROR_TOO_LONG;

/**
 * Validates and normalizes an HTTPS provider base URL, matching the Rust
 * registry rule: trim input, parse as a URL, require `https`, reject userinfo,
 * and trim trailing `/` characters from the serialized URL.
 */
export function validateBaseUrl(
  input: string
): ProviderHelperResult<string, BaseUrlValidationError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: BASE_URL_ERROR_MALFORMED,
      message: 'base URL is required'
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: BASE_URL_ERROR_MALFORMED,
      message: 'base URL must be a full https:// URL'
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: BASE_URL_ERROR_NON_HTTPS,
      message: 'base URL must use the https scheme'
    };
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return {
      ok: false,
      error: BASE_URL_ERROR_USERINFO,
      message: 'base URL must not contain embedded userinfo'
    };
  }

  return { ok: true, value: parsed.href.replace(/\/+$/, '') };
}

/**
 * Trims an optional provider label. Empty labels become `null`; labels over the
 * cap return a typed validation error.
 */
export function validateLabel(
  input: string,
  maxLength = DEFAULT_MAX_PROVIDER_LABEL_LENGTH
): ProviderHelperResult<string | null, LabelValidationError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: LABEL_ERROR_TOO_LONG,
      message: `label must be ${maxLength} characters or fewer`
    };
  }
  return { ok: true, value: trimmed };
}
