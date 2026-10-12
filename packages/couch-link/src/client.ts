import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encode,
  type ClientMessage,
  type ErrorCode,
  type PlayerId,
  type RoomCode,
  type ServerMessage,
} from './protocol';

/** The subset of the WebSocket API couch-link needs; satisfied by browsers, React Native and `ws`. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

export type Role =
  | { kind: 'host'; room?: RoomCode }
  | { kind: 'player'; room: RoomCode; name: string };

export type Status = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'closed';

export interface Session {
  room: RoomCode;
  /** Present for players. */
  playerId?: PlayerId;
  /** Secret used to resume this seat after a reconnect. */
  token: string;
}

export interface CouchLinkEvents {
  status: (status: Status) => void;
  session: (session: Session) => void;
  message: (from: 'host' | PlayerId, data: unknown) => void;
  presence: (playerId: PlayerId, name: string, connected: boolean) => void;
  hostStatus: (connected: boolean) => void;
  error: (code: ErrorCode, message: string) => void;
  kicked: () => void;
}

export interface CouchLinkOptions {
  url: string;
  role: Role;
  /** Defaults to the global WebSocket. */
  socketFactory?: SocketFactory;
  /** Previously issued session, to resume a seat (e.g. after an app restart). */
  resume?: Session;
  pingIntervalMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

type Listeners = { [K in keyof CouchLinkEvents]: Set<CouchLinkEvents[K]> };

/** Errors after which reconnecting cannot help. */
const FATAL_ERRORS: ReadonlySet<ErrorCode> = new Set(['room-not-found', 'room-full', 'name-taken', 'version-mismatch']);

export class CouchLinkClient {
  private socket: SocketLike | null = null;
  private status: Status = 'idle';
  private session: Session | undefined;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private offsets: number[] = [];
  private stopped = false;
  private readonly listeners: Listeners = {
    status: new Set(),
    session: new Set(),
    message: new Set(),
    presence: new Set(),
    hostStatus: new Set(),
    error: new Set(),
    kicked: new Set(),
  };
  private readonly factory: SocketFactory;
  private readonly now: () => number;

  constructor(private readonly options: CouchLinkOptions) {
    this.session = options.resume;
    this.now = options.now ?? Date.now;
    this.factory =
      options.socketFactory ??
      ((url) => {
        const WS = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
        if (!WS) throw new Error('couch-link: no global WebSocket; pass options.socketFactory');
        return new WS(url);
      });
  }

  on<K extends keyof CouchLinkEvents>(event: K, listener: CouchLinkEvents[K]): () => void {
    (this.listeners[event] as Set<CouchLinkEvents[K]>).add(listener);
    return () => (this.listeners[event] as Set<CouchLinkEvents[K]>).delete(listener);
  }

  get currentStatus(): Status {
    return this.status;
  }

  get currentSession(): Session | undefined {
    return this.session;
  }

  /** Estimated relay clock (ms since epoch); use it to align timers across TV and phones. */
  serverNow(): number {
    if (this.offsets.length === 0) return this.now();
    const sorted = [...this.offsets].sort((a, b) => a - b);
    return this.now() + sorted[Math.floor(sorted.length / 2)];
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Player → host, or host → one player / everyone. */
  send(to: 'host' | 'all' | PlayerId, data: unknown): boolean {
    return this.write({ t: 'send', to, data });
  }

  /** Host only: remove a player from the room. */
  kick(playerId: PlayerId): boolean {
    return this.write({ t: 'kick', playerId });
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close(1000, 'client closed');
    this.socket = null;
    this.setStatus('closed');
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.factory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.write(this.handshake());
      this.startPing();
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = decodeServerMessage(ev.data);
      if (msg) this.handle(msg);
    };
    socket.onclose = () => {
      this.clearTimers();
      if (this.stopped) return;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // onclose follows; reconnect is handled there.
    };
  }

  private handshake(): ClientMessage {
    const { role } = this.options;
    if (role.kind === 'host') {
      return {
        t: 'host',
        v: PROTOCOL_VERSION,
        room: this.session?.room ?? role.room,
        hostToken: this.session?.token,
      };
    }
    return {
      t: 'join',
      v: PROTOCOL_VERSION,
      room: role.room,
      name: role.name,
      playerId: this.session?.playerId,
      token: this.session?.token,
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hosted':
        this.session = { room: msg.room, token: msg.hostToken };
        this.emit('session', this.session);
        this.setStatus('ready');
        break;
      case 'joined':
        this.session = { room: msg.room, playerId: msg.playerId, token: msg.token };
        this.emit('session', this.session);
        this.setStatus('ready');
        break;
      case 'message':
        this.emit('message', msg.from, msg.data);
        break;
      case 'presence':
        this.emit('presence', msg.playerId, msg.name, msg.connected);
        break;
      case 'host-status':
        this.emit('hostStatus', msg.connected);
        break;
      case 'kicked':
        this.emit('kicked');
        this.close();
        break;
      case 'pong': {
        const t = this.now();
        const rtt = t - msg.ts;
        this.offsets = [...this.offsets.slice(-4), msg.serverTs - (msg.ts + rtt / 2)];
        break;
      }
      case 'error':
        this.emit('error', msg.code, msg.message);
        if (FATAL_ERRORS.has(msg.code)) this.close();
        break;
    }
  }

  private write(msg: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(encode(msg));
    return true;
  }

  private startPing(): void {
    const ping = () => this.write({ t: 'ping', ts: this.now() });
    ping();
    this.pingTimer = setInterval(ping, this.options.pingIntervalMs ?? 5000);
  }

  private scheduleReconnect(): void {
    const max = this.options.maxBackoffMs ?? 5000;
    const delay = Math.min(max, 250 * 2 ** this.attempt);
    this.attempt += 1;
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = undefined;
    this.retryTimer = undefined;
  }

  private setStatus(status: Status): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  private emit<K extends keyof CouchLinkEvents>(event: K, ...args: Parameters<CouchLinkEvents[K]>): void {
    for (const listener of this.listeners[event]) {
      (listener as (...a: Parameters<CouchLinkEvents[K]>) => void)(...args);
    }
  }
}
