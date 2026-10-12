import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isValidRoomCode,
  joinUrl,
  normalizeRoomCode,
} from '../src/roomCode';
import { decodeClientMessage, sanitizeName } from '../src/protocol';

describe('room codes', () => {
  it('generates valid 4-letter codes without vowels', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[AEIOUL]/);
    }
  });

  it('is deterministic with an injected random source', () => {
    expect(generateRoomCode(() => 0)).toBe(ROOM_CODE_ALPHABET[0].repeat(4));
  });

  it('normalizes what people type', () => {
    expect(normalizeRoomCode(' bx-qt ')).toBe('BXQT');
    expect(isValidRoomCode('BXQ')).toBe(false);
    expect(isValidRoomCode('BOQT')).toBe(false);
  });

  it('builds join URLs without the URL API', () => {
    expect(joinUrl('https://play.example.com/', 'BXQT')).toBe('https://play.example.com/?room=BXQT');
    expect(joinUrl('http://192.168.1.5:5173/?lang=en#top', 'BXQT')).toBe(
      'http://192.168.1.5:5173/?lang=en&room=BXQT#top',
    );
  });
});

describe('protocol', () => {
  it('rejects malformed frames', () => {
    expect(decodeClientMessage('not json')).toBeNull();
    expect(decodeClientMessage('[]')).toBeNull();
    expect(decodeClientMessage('{"t":"join","v":1}')).toBeNull();
    expect(decodeClientMessage('{"t":"send","to":"host"}')).toBeNull();
    expect(decodeClientMessage('{"t":"join","v":1,"room":"BXQT","name":"Ana"}')).toEqual({
      t: 'join',
      v: 1,
      room: 'BXQT',
      name: 'Ana',
    });
  });

  it('sanitizes display names', () => {
    expect(sanitizeName('   Grandpa    Joe  ')).toBe('Grandpa Joe');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
    expect(sanitizeName('   ')).toBe('');
  });
});
