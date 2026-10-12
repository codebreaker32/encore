import { describe, expect, it } from 'vitest';
import type { ServerMessage } from 'couch-link';
import { Relay, type Connection } from '../src/relay';

class FakeConn implements Connection {
  static next = 0;
  readonly id = `c${FakeConn.next++}`;
  inbox: ServerMessage[] = [];
  closed = false;
  send(msg: ServerMessage) {
    this.inbox.push(msg);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

const send = (relay: Relay, conn: Connection, msg: object) => relay.handle(conn, JSON.stringify(msg));

function setup(options = {}) {
  let clock = 1_000;
  const relay = new Relay({ now: () => clock, ...options });
  const tv = new FakeConn();
  send(relay, tv, { t: 'host', v: 1 });
  const room = tv.last('hosted')!.room;
  const join = (name: string) => {
    const phone = new FakeConn();
    send(relay, phone, { t: 'join', v: 1, room, name });
    return phone;
  };
  return { relay, tv, room, join, tick: (ms: number) => (clock += ms) };
}

describe('Relay', () => {
  it('creates a room and lets players join', () => {
    const { tv, room, join } = setup();
    const ana = join('Ana');
    expect(ana.last('joined')).toMatchObject({ room, name: 'Ana' });
    expect(tv.last('presence')).toMatchObject({ name: 'Ana', connected: true });
  });

  it('routes player → host only, and host → one or all', () => {
    const { relay, tv, join } = setup();
    const ana = join('Ana');
    const ben = join('Ben');
    const anaId = ana.last('joined')!.playerId;

    send(relay, ana, { t: 'send', to: 'host', data: { vote: 2 } });
    expect(tv.last('message')).toEqual({ t: 'message', from: anaId, data: { vote: 2 } });

    send(relay, ana, { t: 'send', to: 'all', data: 'spam' });
    expect(ana.last('error')?.code).toBe('not-host');
    expect(ben.last('message')).toBeUndefined();

    send(relay, tv, { t: 'send', to: 'all', data: { phase: 'draw' } });
    expect(ana.last('message')?.data).toEqual({ phase: 'draw' });
    expect(ben.last('message')?.data).toEqual({ phase: 'draw' });

    send(relay, tv, { t: 'send', to: anaId, data: { part: 'head' } });
    expect(ana.last('message')?.data).toEqual({ part: 'head' });
    expect(ben.last('message')?.data).toEqual({ phase: 'draw' });
  });

  it('rejects unknown rooms, duplicate names and full rooms', () => {
    const { relay, join } = setup({ maxPlayers: 2 });
    const stray = new FakeConn();
    send(relay, stray, { t: 'join', v: 1, room: 'ZZZZ', name: 'Ana' });
    expect(stray.last('error')?.code).toBe('room-not-found');

    join('Ana');
    expect(join('ana').last('error')?.code).toBe('name-taken');
    join('Ben');
    expect(join('Cy').last('error')?.code).toBe('room-full');
  });

  it("frees a departed player's name after the resume window, and only then", () => {
    const { relay, tv, room, join, tick } = setup({ resumeWindowMs: 3000 });
    const ana = join('Ana');
    const first = ana.last('joined')!;
    // While Ana is connected, her name is hers.
    expect(join('Ana').last('error')?.code).toBe('name-taken');
    relay.disconnect(ana);
    // Just gone: the seat is still held for her own reconnect.
    tick(1000);
    expect(join('ana').last('error')?.code).toBe('name-taken');
    // Past the window, a new phone named Ana takes the seat over: the same player id, a new token.
    tick(2500);
    const again = join('Ana');
    const taken = again.last('joined')!;
    expect(taken).toMatchObject({ room, playerId: first.playerId, name: 'Ana' });
    expect(taken.token).not.toBe(first.token);
    expect(tv.last('presence')).toMatchObject({ playerId: first.playerId, connected: true });
    // The old token cannot resume the seat any more; as a fresh join it meets the live seat.
    const old = new FakeConn();
    send(relay, old, { t: 'join', v: 1, room, name: 'Ana', playerId: first.playerId, token: first.token });
    expect(old.last('error')?.code).toBe('name-taken');
    send(relay, again, { t: 'send', to: 'host', data: 'hello' });
    expect(tv.last('message')).toEqual({ t: 'message', from: first.playerId, data: 'hello' });
  });

  it('still lets a live token resume its seat inside or past the window', () => {
    const { relay, room, join, tick } = setup({ resumeWindowMs: 3000 });
    const ben = join('Ben');
    const seat = ben.last('joined')!;
    relay.disconnect(ben);
    tick(60_000);
    const back = new FakeConn();
    send(relay, back, { t: 'join', v: 1, room, name: 'Ben', playerId: seat.playerId, token: seat.token });
    expect(back.last('joined')).toMatchObject({ playerId: seat.playerId, token: seat.token });
  });

  it('lets a player resume their seat after reconnecting', () => {
    const { relay, tv, room, join } = setup();
    const ana = join('Ana');
    const { playerId, token } = ana.last('joined')!;
    relay.disconnect(ana);
    expect(tv.last('presence')).toMatchObject({ playerId, connected: false });

    const anaAgain = new FakeConn();
    send(relay, anaAgain, { t: 'join', v: 1, room, name: 'whatever', playerId, token });
    expect(anaAgain.last('joined')).toMatchObject({ playerId, name: 'Ana' });
    expect(tv.last('presence')).toMatchObject({ playerId, connected: true });
  });

  it('lets the TV resume hosting and tells players', () => {
    const { relay, tv, room, join } = setup();
    const ana = join('Ana');
    const { hostToken } = tv.last('hosted')!;
    relay.disconnect(tv);
    expect(ana.last('host-status')).toEqual({ t: 'host-status', connected: false });

    const tvAgain = new FakeConn();
    send(relay, tvAgain, { t: 'host', v: 1, room, hostToken });
    expect(tvAgain.last('hosted')?.room).toBe(room);
    expect(tvAgain.last('presence')).toMatchObject({ name: 'Ana', connected: true });
    expect(ana.last('host-status')).toEqual({ t: 'host-status', connected: true });
  });

  it('closes rooms whose host never comes back', () => {
    const { relay, tv, join, tick } = setup({ hostGraceMs: 60_000 });
    const ana = join('Ana');
    relay.disconnect(tv);
    tick(59_000);
    relay.sweep();
    expect(relay.roomCount).toBe(1);
    tick(2_000);
    relay.sweep();
    expect(relay.roomCount).toBe(0);
    expect(ana.closed).toBe(true);
  });

  it('lets only the host kick players', () => {
    const { relay, tv, join } = setup();
    const ana = join('Ana');
    const ben = join('Ben');
    const benId = ben.last('joined')!.playerId;
    send(relay, ana, { t: 'kick', playerId: benId });
    expect(ana.last('error')?.code).toBe('not-host');
    send(relay, tv, { t: 'kick', playerId: benId });
    expect(ben.last('kicked')).toBeDefined();
    expect(ben.closed).toBe(true);
  });

  it('answers pings with the server clock and rejects garbage', () => {
    const { relay, tv } = setup();
    send(relay, tv, { t: 'ping', ts: 5 });
    expect(tv.last('pong')).toEqual({ t: 'pong', ts: 5, serverTs: 1_000 });
    relay.handle(tv, '{oops');
    expect(tv.last('error')?.code).toBe('bad-message');
  });
});
