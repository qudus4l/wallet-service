/** Canonical forms used for storage, uniqueness and blacklist matching. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Strips common formatting characters; validation then requires E.164 (+2348012345678). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
