/**
 * couch-link wire protocol (JSON over a single WebSocket).
 *
 * Topology: one HOST (the TV, authoritative game state) and N PLAYERS (phones).
 * Players can only talk to the host; the host can address one player or all.
 * The relay is dumb routing + presence, so any transport that preserves these
 * semantics (local Node relay, API Gateway WebSocket, AppSync Events) works.
 */

export const PROTOCOL_VERSION = 1;

export type PlayerId = string;
export type RoomCode = string;

/** Messages a client sends to the relay. */
export type ClientMessage =
  | { t: 'host'; v: number; room?: RoomCode; hostToken?: string }
  | { t: 'join'; v: number; room: RoomCode; name: string; playerId?: PlayerId; token?: string }
  | { t: 'send'; to: 'host' | 'all' | PlayerId; data: unknown }
  | { t: 'kick'; playerId: PlayerId }
  | { t: 'ping'; ts: number };

/** Messages the relay sends to a client. */
export type ServerMessage =
  | { t: 'hosted'; room: RoomCode; hostToken: string }
  | { t: 'joined'; room: RoomCode; playerId: PlayerId; token: string; name: string }
  | { t: 'message'; from: 'host' | PlayerId; data: unknown }
  | { t: 'presence'; playerId: PlayerId; name: string; connected: boolean }
  | { t: 'host-status'; connected: boolean }
  | { t: 'kicked' }
  | { t: 'pong'; ts: number; serverTs: number }
  | { t: 'error'; code: ErrorCode; message: string };

export type ErrorCode =
  | 'bad-message'
  | 'version-mismatch'
  | 'room-not-found'
  | 'room-full'
  | 'name-taken'
  | 'not-host'
  | 'not-joined'
  | 'unknown-player';

export const MAX_NAME_LENGTH = 16;

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

/** Parse and minimally validate an inbound frame. Returns null for anything malformed. */
export function decodeClientMessage(raw: string): ClientMessage | null {
  const msg = safeParse(raw);
  if (!msg || typeof msg.t !== 'string') return null;
  switch (msg.t) {
    case 'host':
      return typeof msg.v === 'number' ? (msg as ClientMessage) : null;
    case 'join':
      return typeof msg.v === 'number' && typeof msg.room === 'string' && typeof msg.name === 'string'
        ? (msg as ClientMessage)
        : null;
    case 'send':
      return typeof msg.to === 'string' && 'data' in msg ? (msg as ClientMessage) : null;
    case 'kick':
      return typeof msg.playerId === 'string' ? (msg as ClientMessage) : null;
    case 'ping':
      return typeof msg.ts === 'number' ? (msg as ClientMessage) : null;
    default:
      return null;
  }
}

export function decodeServerMessage(raw: string): ServerMessage | null {
  const msg = safeParse(raw);
  return msg && typeof msg.t === 'string' ? (msg as ServerMessage) : null;
}

/** Trim, collapse whitespace and clamp a display name. Returns '' if nothing usable is left. */
export function sanitizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
