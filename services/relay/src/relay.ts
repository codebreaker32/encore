import { randomBytes, randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  sanitizeName,
  type ClientMessage,
  type ErrorCode,
  type PlayerId,
  type RoomCode,
  type ServerMessage,
} from 'couch-link';

/** One live socket, abstracted so the routing logic is testable and transport-independent. */
export interface Connection {
  readonly id: string;
  send(msg: ServerMessage): void;
  close(): void;
}

interface Player {
  id: PlayerId;
  name: string;
  token: string;
  conn?: Connection;
  /** When the player's connection closed; undefined while connected. */
  leftAt?: number;
}

interface Room {
  code: RoomCode;
  hostToken: string;
  host?: Connection;
  hostLeftAt?: number;
  players: Map<PlayerId, Player>;
}

type Seat = { room: RoomCode; role: 'host' } | { room: RoomCode; role: 'player'; playerId: PlayerId };

export interface RelayOptions {
  maxPlayers?: number;
  /** How long a room survives without its host before it is closed. */
  hostGraceMs?: number;
  /**
   * How long a departed player's seat is held for them alone (their own token resumes it at any time). After this, a
   * new phone joining under the same name takes the seat over, with a new token, so a phone that lost its seat token
   * (or a replacement phone) is never locked out of its name.
   */
  resumeWindowMs?: number;
  now?: () => number;
  random?: () => number;
}

export class Relay {
  private readonly rooms = new Map<RoomCode, Room>();
  private readonly seats = new Map<string, Seat>();
  private readonly maxPlayers: number;
  private readonly hostGraceMs: number;
  private readonly resumeWindowMs: number;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(options: RelayOptions = {}) {
    this.maxPlayers = options.maxPlayers ?? 8;
    this.hostGraceMs = options.hostGraceMs ?? 10 * 60_000;
    this.resumeWindowMs = options.resumeWindowMs ?? 3_000;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Open room codes, for local test harnesses only (served by `/rooms` when RELAY_DEBUG_ROOMS=1). */
  get roomCodes(): RoomCode[] {
    return [...this.rooms.keys()];
  }

  handle(conn: Connection, raw: string): void {
    const msg = decodeClientMessage(raw);
    if (!msg) return this.fail(conn, 'bad-message', 'Malformed message');
    switch (msg.t) {
      case 'host':
        return this.host(conn, msg);
      case 'join':
        return this.join(conn, msg);
      case 'send':
        return this.route(conn, msg);
      case 'kick':
        return this.kick(conn, msg.playerId);
      case 'ping':
        return conn.send({ t: 'pong', ts: msg.ts, serverTs: this.now() });
    }
  }

  disconnect(conn: Connection): void {
    const seat = this.seats.get(conn.id);
    this.seats.delete(conn.id);
    const room = seat && this.rooms.get(seat.room);
    if (!seat || !room) return;

    if (seat.role === 'host') {
      if (room.host?.id !== conn.id) return;
      room.host = undefined;
      room.hostLeftAt = this.now();
      this.broadcast(room, { t: 'host-status', connected: false });
    } else {
      const player = room.players.get(seat.playerId);
      if (!player || player.conn?.id !== conn.id) return;
      player.conn = undefined;
      player.leftAt = this.now();
      room.host?.send({ t: 'presence', playerId: player.id, name: player.name, connected: false });
    }
  }

  /** Close rooms whose host has been gone longer than the grace period. Call periodically. */
  sweep(): void {
    const cutoff = this.now() - this.hostGraceMs;
    for (const room of this.rooms.values()) {
      if (room.host || room.hostLeftAt === undefined || room.hostLeftAt > cutoff) continue;
      for (const player of room.players.values()) {
        if (player.conn) {
          this.seats.delete(player.conn.id);
          player.conn.send({ t: 'error', code: 'room-not-found', message: 'The game has ended' });
          player.conn.close();
        }
      }
      this.rooms.delete(room.code);
    }
  }

  private host(conn: Connection, msg: Extract<ClientMessage, { t: 'host' }>): void {
    if (msg.v !== PROTOCOL_VERSION) return this.fail(conn, 'version-mismatch', `Relay speaks v${PROTOCOL_VERSION}`);

    const existing = msg.room ? this.rooms.get(normalizeRoomCode(msg.room)) : undefined;
    if (existing && msg.hostToken && msg.hostToken === existing.hostToken) {
      if (existing.host && existing.host.id !== conn.id) {
        this.seats.delete(existing.host.id);
        existing.host.close();
      }
      existing.host = conn;
      existing.hostLeftAt = undefined;
      this.seats.set(conn.id, { room: existing.code, role: 'host' });
      conn.send({ t: 'hosted', room: existing.code, hostToken: existing.hostToken });
      for (const p of existing.players.values()) {
        conn.send({ t: 'presence', playerId: p.id, name: p.name, connected: Boolean(p.conn) });
      }
      this.broadcast(existing, { t: 'host-status', connected: true });
      return;
    }

    const room: Room = { code: this.freshCode(), hostToken: randomUUID(), host: conn, players: new Map() };
    this.rooms.set(room.code, room);
    this.seats.set(conn.id, { room: room.code, role: 'host' });
    conn.send({ t: 'hosted', room: room.code, hostToken: room.hostToken });
  }

  private join(conn: Connection, msg: Extract<ClientMessage, { t: 'join' }>): void {
    if (msg.v !== PROTOCOL_VERSION) return this.fail(conn, 'version-mismatch', `Relay speaks v${PROTOCOL_VERSION}`);
    const code = normalizeRoomCode(msg.room);
    const room = isValidRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) return this.fail(conn, 'room-not-found', `No game with code ${code}`);

    // Resume an existing seat.
    const resumed = msg.playerId ? room.players.get(msg.playerId) : undefined;
    if (resumed && msg.token === resumed.token) {
      if (resumed.conn && resumed.conn.id !== conn.id) {
        this.seats.delete(resumed.conn.id);
        resumed.conn.close();
      }
      resumed.conn = conn;
      resumed.leftAt = undefined;
      this.seats.set(conn.id, { room: room.code, role: 'player', playerId: resumed.id });
      conn.send({ t: 'joined', room: room.code, playerId: resumed.id, token: resumed.token, name: resumed.name });
      room.host?.send({ t: 'presence', playerId: resumed.id, name: resumed.name, connected: true });
      return;
    }

    const name = sanitizeName(msg.name);
    if (!name) return this.fail(conn, 'bad-message', 'Pick a nickname');
    const same = [...room.players.values()].find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same && same.conn) return this.fail(conn, 'name-taken', `${name} is already playing`);
    if (same && this.now() - (same.leftAt ?? 0) < this.resumeWindowMs) {
      return this.fail(conn, 'name-taken', `${name} just left; try again in a few seconds`);
    }
    if (same) {
      // A departed seat past its resume window: the name's new phone takes it over (same player id, so the TV keeps
      // one entry for the name), and a new token means the old one can no longer resume it.
      same.token = randomUUID();
      same.conn = conn;
      same.leftAt = undefined;
      this.seats.set(conn.id, { room: room.code, role: 'player', playerId: same.id });
      conn.send({ t: 'joined', room: room.code, playerId: same.id, token: same.token, name: same.name });
      room.host?.send({ t: 'presence', playerId: same.id, name: same.name, connected: true });
      return;
    }
    if (room.players.size >= this.maxPlayers) return this.fail(conn, 'room-full', 'This game is full');

    const player: Player = { id: randomBytes(4).toString('hex'), name, token: randomUUID(), conn };
    room.players.set(player.id, player);
    this.seats.set(conn.id, { room: room.code, role: 'player', playerId: player.id });
    conn.send({ t: 'joined', room: room.code, playerId: player.id, token: player.token, name });
    room.host?.send({ t: 'presence', playerId: player.id, name, connected: true });
  }

  private route(conn: Connection, msg: Extract<ClientMessage, { t: 'send' }>): void {
    const seat = this.seats.get(conn.id);
    const room = seat && this.rooms.get(seat.room);
    if (!seat || !room) return this.fail(conn, 'not-joined', 'Join a room first');

    if (seat.role === 'player') {
      if (msg.to !== 'host') return this.fail(conn, 'not-host', 'Players can only message the host');
      room.host?.send({ t: 'message', from: seat.playerId, data: msg.data });
      return;
    }

    if (msg.to === 'all') {
      for (const p of room.players.values()) p.conn?.send({ t: 'message', from: 'host', data: msg.data });
      return;
    }
    const target = room.players.get(msg.to);
    if (!target) return this.fail(conn, 'unknown-player', `No player ${msg.to}`);
    target.conn?.send({ t: 'message', from: 'host', data: msg.data });
  }

  private kick(conn: Connection, playerId: PlayerId): void {
    const seat = this.seats.get(conn.id);
    const room = seat && this.rooms.get(seat.room);
    if (!seat || !room || seat.role !== 'host') return this.fail(conn, 'not-host', 'Only the host can remove players');
    const player = room.players.get(playerId);
    if (!player) return this.fail(conn, 'unknown-player', `No player ${playerId}`);
    room.players.delete(playerId);
    if (player.conn) {
      this.seats.delete(player.conn.id);
      player.conn.send({ t: 'kicked' });
      player.conn.close();
    }
    conn.send({ t: 'presence', playerId, name: player.name, connected: false });
  }

  private broadcast(room: Room, msg: ServerMessage): void {
    for (const p of room.players.values()) p.conn?.send(msg);
  }

  private fail(conn: Connection, code: ErrorCode, message: string): void {
    conn.send({ t: 'error', code, message });
  }

  private freshCode(): RoomCode {
    for (;;) {
      const code = generateRoomCode(this.random);
      if (!this.rooms.has(code)) return code;
    }
  }
}
