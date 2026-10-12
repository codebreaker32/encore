import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CouchLinkClient, PROTOCOL_VERSION, type CouchLinkOptions, type SocketLike } from '../src';

/** An in-memory WebSocket: the test opens it, feeds it server frames and reads what the client wrote. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  serve(msg: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  last(): Record<string, unknown> | undefined {
    return this.sent[this.sent.length - 1];
  }
}

let sockets: FakeSocket[];
let clock: number;

function client(options: Partial<CouchLinkOptions> & Pick<CouchLinkOptions, 'role'>): CouchLinkClient {
  return new CouchLinkClient({
    url: 'ws://relay.test',
    socketFactory: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    now: () => clock,
    pingIntervalMs: 1000,
    ...options,
  });
}

const latest = () => sockets[sockets.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  clock = 1_000_000;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CouchLinkClient', () => {
  it('a host introduces itself with the protocol version and becomes ready with its room', () => {
    const tv = client({ role: { kind: 'host' } });
    const statuses: string[] = [];
    const sessions: unknown[] = [];
    tv.on('status', (s) => statuses.push(s));
    tv.on('session', (s) => sessions.push(s));
    tv.connect();
    latest().open();
    expect(latest().sent[0]).toEqual({ t: 'host', v: PROTOCOL_VERSION });
    latest().serve({ t: 'hosted', room: 'ABCD', hostToken: 'secret' });
    expect(sessions).toEqual([{ room: 'ABCD', token: 'secret' }]);
    expect(statuses).toEqual(['connecting', 'ready']);
    expect(tv.currentSession).toEqual({ room: 'ABCD', token: 'secret' });
  });

  it('a player joins by room and name, and a saved session resumes its seat', () => {
    const phone = client({
      role: { kind: 'player', room: 'ABCD', name: 'Aman' },
      resume: { room: 'ABCD', playerId: 'p1', token: 't1' },
    });
    phone.connect();
    latest().open();
    expect(latest().sent[0]).toEqual({ t: 'join', v: PROTOCOL_VERSION, room: 'ABCD', name: 'Aman', playerId: 'p1', token: 't1' });
  });

  it('after a dropped connection it reconnects with backoff and resumes with the issued token', () => {
    const tv = client({ role: { kind: 'host' }, maxBackoffMs: 1000 });
    tv.connect();
    latest().open();
    latest().serve({ t: 'hosted', room: 'WXYZ', hostToken: 'h1' });

    latest().drop();
    expect(tv.currentStatus).toBe('reconnecting');
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(249);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2); // 250 ms after the first drop

    latest().drop(); // the retry fails before opening: the next wait doubles
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    latest().open();
    expect(latest().sent[0]).toEqual({ t: 'host', v: PROTOCOL_VERSION, room: 'WXYZ', hostToken: 'h1' });
  });

  it('backoff is capped at maxBackoffMs', () => {
    const tv = client({ role: { kind: 'host' }, maxBackoffMs: 600 });
    tv.connect();
    for (let i = 0; i < 6; i++) {
      latest().drop();
      vi.advanceTimersByTime(600);
    }
    expect(sockets).toHaveLength(7);
  });

  it('send only writes on an open socket', () => {
    const phone = client({ role: { kind: 'player', room: 'ABCD', name: 'Aman' } });
    phone.connect();
    expect(phone.send('host', { type: 'mic' })).toBe(false);
    latest().open();
    expect(phone.send('host', { type: 'mic' })).toBe(true);
    expect(latest().last()).toEqual({ t: 'send', to: 'host', data: { type: 'mic' } });
  });

  it('routes messages, presence and host status to listeners', () => {
    const tv = client({ role: { kind: 'host' } });
    const got: unknown[] = [];
    tv.on('message', (from, data) => got.push(['message', from, data]));
    tv.on('presence', (id, name, connected) => got.push(['presence', id, name, connected]));
    tv.on('hostStatus', (connected) => got.push(['hostStatus', connected]));
    tv.connect();
    latest().open();
    latest().serve({ t: 'presence', playerId: 'p1', name: 'Aman', connected: true });
    latest().serve({ t: 'message', from: 'p1', data: { type: 'started' } });
    latest().serve({ t: 'host-status', connected: false });
    expect(got).toEqual([
      ['presence', 'p1', 'Aman', true],
      ['message', 'p1', { type: 'started' }],
      ['hostStatus', false],
    ]);
  });

  it('a listener can be removed', () => {
    const tv = client({ role: { kind: 'host' } });
    const got: unknown[] = [];
    const off = tv.on('message', (_from, data) => got.push(data));
    tv.connect();
    latest().open();
    latest().serve({ t: 'message', from: 'p1', data: 1 });
    off();
    latest().serve({ t: 'message', from: 'p1', data: 2 });
    expect(got).toEqual([1]);
  });

  it('pings on open and on every interval', () => {
    const tv = client({ role: { kind: 'host' } });
    tv.connect();
    latest().open();
    const pings = () => latest().sent.filter((m) => m.t === 'ping').length;
    expect(pings()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(pings()).toBe(4);
  });

  it('serverNow is the local clock plus the median offset from recent pongs', () => {
    const tv = client({ role: { kind: 'host' } });
    expect(tv.serverNow()).toBe(clock); // no pongs yet: the local clock
    tv.connect();
    latest().open();
    // Three pongs with a 100 ms round trip; the relay's clock is ahead by 5000, 5010 and 9000 ms (one outlier).
    for (const ahead of [5000, 9000, 5010]) {
      const sentAt = clock;
      clock += 100;
      latest().serve({ t: 'pong', ts: sentAt, serverTs: sentAt + 50 + ahead });
    }
    expect(tv.serverNow()).toBe(clock + 5010);
  });

  it('fatal errors close for good; other errors are reported and the link stays up', () => {
    const phone = client({ role: { kind: 'player', room: 'NOPE', name: 'Aman' } });
    const errors: string[] = [];
    phone.on('error', (code) => errors.push(code));
    phone.connect();
    latest().open();
    latest().serve({ t: 'error', code: 'bad-message', message: 'Malformed message' });
    expect(phone.currentStatus).not.toBe('closed');
    latest().serve({ t: 'error', code: 'room-not-found', message: 'No such room' });
    expect(errors).toEqual(['bad-message', 'room-not-found']);
    expect(phone.currentStatus).toBe('closed');
    latest().drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1); // no reconnect after a fatal error
  });

  it('a kick is reported and ends the link', () => {
    const phone = client({ role: { kind: 'player', room: 'ABCD', name: 'Aman' } });
    let kicked = false;
    phone.on('kicked', () => (kicked = true));
    phone.connect();
    latest().open();
    latest().serve({ t: 'kicked' });
    expect(kicked).toBe(true);
    expect(phone.currentStatus).toBe('closed');
    expect(latest().closed).toEqual({ code: 1000, reason: 'client closed' });
  });

  it('close stops reconnecting', () => {
    const tv = client({ role: { kind: 'host' } });
    tv.connect();
    latest().open();
    tv.close();
    latest().drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(tv.currentStatus).toBe('closed');
  });

  it('ignores binary frames and malformed JSON', () => {
    const tv = client({ role: { kind: 'host' } });
    const got: unknown[] = [];
    tv.on('message', (_f, d) => got.push(d));
    tv.connect();
    latest().open();
    latest().onmessage?.({ data: new Uint8Array([1, 2]) });
    latest().onmessage?.({ data: '{not json' });
    latest().onmessage?.({ data: '[1,2]' });
    expect(got).toEqual([]);
  });
});
