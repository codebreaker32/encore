import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CouchLinkClient, type SocketLike } from 'couch-link';
import { startRelayServer, type RelayServer } from '../src/server';

const socketFactory = (url: string) => new WebSocket(url) as unknown as SocketLike;

function waitFor<T>(register: (resolve: (value: T) => void) => void, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

describe('couch-link client ↔ relay over real WebSockets', () => {
  let server: RelayServer | undefined;
  const clients: CouchLinkClient[] = [];

  afterEach(async () => {
    clients.splice(0).forEach((c) => c.close());
    await server?.close();
  });

  it('hosts, joins, exchanges messages and syncs clocks', async () => {
    server = await startRelayServer(0);
    const url = `ws://127.0.0.1:${server.port}`;

    const tv = new CouchLinkClient({ url, role: { kind: 'host' }, socketFactory });
    clients.push(tv);
    const hosted = waitFor<string>((done) => tv.on('session', (s) => done(s.room)));
    tv.connect();
    const room = await hosted;

    const phone = new CouchLinkClient({ url, role: { kind: 'player', room, name: 'Grandpa' }, socketFactory });
    clients.push(phone);
    const presence = waitFor<string>((done) => tv.on('presence', (_id, name) => done(name)));
    const joined = waitFor<string | undefined>((done) => phone.on('session', (s) => done(s.playerId)));
    phone.connect();
    const playerId = await joined;
    expect(await presence).toBe('Grandpa');

    const atHost = waitFor<unknown>((done) => tv.on('message', (from, data) => from === playerId && done(data)));
    phone.send('host', { vote: 'creature-1' });
    expect(await atHost).toEqual({ vote: 'creature-1' });

    const atPhone = waitFor<unknown>((done) => phone.on('message', (_from, data) => done(data)));
    tv.send('all', { phase: 'drawing', part: 'head' });
    expect(await atPhone).toEqual({ phase: 'drawing', part: 'head' });

    expect(Math.abs(phone.serverNow() - Date.now())).toBeLessThan(1000);
  });
});
