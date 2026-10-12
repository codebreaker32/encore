import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { encode } from 'couch-link';
import { Relay, type RelayOptions } from './relay';

export interface RelayServer {
  port: number;
  close(): Promise<void>;
}

/** Drawings travel as vector paths; 256 KB is ample per frame. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

export function startRelayServer(port: number, options: RelayOptions = {}): Promise<RelayServer> {
  const relay = new Relay(options);
  const http: Server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: relay.roomCount }));
      return;
    }
    if (req.url === '/rooms' && process.env.RELAY_DEBUG_ROOMS === '1') {
      // Local test harnesses (src/fake-phone.ts) find the TV's room here. Off unless asked for: room codes are the only
      // thing between a stranger and a living room.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ rooms: relay.roomCodes }));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD_BYTES });

  wss.on('connection', (socket) => {
    const conn = {
      id: randomUUID(),
      send: (msg: Parameters<typeof encode>[0]) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(encode(msg));
      },
      close: () => socket.close(1000),
    };
    socket.on('message', (data, isBinary) => {
      if (!isBinary) relay.handle(conn, data.toString());
    });
    socket.on('close', () => relay.disconnect(conn));
  });

  const sweeper = setInterval(() => relay.sweep(), 60_000);

  return new Promise((resolve) => {
    http.listen(port, '0.0.0.0', () => {
      const address = http.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(sweeper);
            for (const client of wss.clients) client.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  startRelayServer(port).then(({ port: bound }) => {
    console.log(`couch-link relay listening on ws://0.0.0.0:${bound} (health: http://localhost:${bound}/health)`);
  });
}
