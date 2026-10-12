/**
 * Four-letter room codes that are easy to read from across a room and type on a phone.
 * Vowels are excluded so codes cannot spell words (offensive or otherwise), and
 * look-alike letters (I, L, O) are excluded for 10-foot legibility.
 */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercase and strip anything that cannot be part of a code (spaces, dashes). */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

/**
 * URL a phone opens from the TV's QR code, e.g. https://play.example.com/?room=BXQT
 * String-based on purpose: React Native 0.72's URL polyfill does not implement searchParams.set.
 */
export function joinUrl(baseUrl: string, room: string): string {
  const [withoutHash, hash = ''] = baseUrl.split('#', 2);
  const separator = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${separator}room=${encodeURIComponent(room)}${hash ? `#${hash}` : ''}`;
}
