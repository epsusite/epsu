export function normalizeCountryCode(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

export function isValidCountryCode(value) {
  return /^[A-Z]{2}$/.test(value);
}
