# couch-link

Phones as controllers for a TV app, like Jackbox: the TV shows a room code and a QR code, players join from a browser on their phone (no install), and the TV and phones exchange messages through a small relay. Built for **React Native for Vega** (Fire TV), and it also works in React Native on Android TV and on the web. MIT.

- **No dependencies.** It needs only `WebSocket`: the global one in browsers and React Native, or `ws` in Node through `socketFactory`.
- **Safe for older runtimes.** ES2020 and TypeScript 4.8, so it runs on RN 0.72 / Hermes as Vega ships them. URLs are built with plain strings, because RN 0.72's URL polyfill lacks `searchParams.set`.
- **One authoritative host.** The TV owns the game state. Players can only message the host; the host messages one player or everyone. The relay only routes and tracks presence.
- **Survives Wi-Fi drops.** A phone that drops its Wi-Fi gets its seat back: the relay issues a token on join, and the client resumes with it after an exponential backoff (250 ms doubling, capped). A host can rejoin its own room within a grace period.
- **A shared clock.** `serverNow()` estimates the relay's clock from the median of recent ping round trips, so a TV and several phones can start something at the same instant (`startAt`).
- **Codes readable from the sofa.** Four letters from `BCDFGHJKMNPQRSTVWXZ`: no vowels (codes can't spell words), and no I, L or O (they're easy to misread from 10 feet).

## Use

```ts
import { CouchLinkClient, joinUrl } from 'couch-link';

// On the TV
const tv = new CouchLinkClient({ url: 'wss://relay.example.com', role: { kind: 'host' } });
tv.on('session', (s) => showQr(joinUrl('https://play.example.com/', s.room)));
tv.on('presence', (playerId, name, connected) => updateSeat(playerId, name, connected));
tv.on('message', (from, data) => handlePlayerMessage(from, data));
tv.connect();
tv.send('all', { type: 'arm', startAt: tv.serverNow() + 1500 });

// On a phone (any browser)
const phone = new CouchLinkClient({ url: 'wss://relay.example.com', role: { kind: 'player', room: 'BXQT', name: 'Aman' } });
phone.on('session', (s) => localStorage.setItem('seat', JSON.stringify(s))); // pass it back as `resume` after a reload
phone.on('message', (_from, data) => handleTvMessage(data));
phone.connect();
phone.send('host', { type: 'mic', ready: true });
```

Events: `status` (`connecting`, `ready`, `reconnecting`, `closed`), `session`, `message`, `presence`, `hostStatus` and `error`; after a fatal `error` (`room-not-found`, `room-full`, `name-taken`, `version-mismatch`) or a `kicked` event, the client closes and doesn't retry. `send()` returns `false` while the socket isn't open. The game itself decides what to buffer.

## Relay

`services/relay` in this repository is the reference relay: Node and `ws`, with routing kept in a transport-independent `Relay` class (`relay.ts`) and `server.ts` as a thin WebSocket wrapper. It supports 8 players per room by default, and a host's room survives 10 minutes without its host. Anything that preserves the same semantics can stand in for it, such as API Gateway WebSocket or AppSync Events. The wire format is in `src/protocol.ts` (`PROTOCOL_VERSION`, JSON over one socket).

## Tests

`yarn workspace couch-link test` covers the client (handshakes, seat resume, the backoff schedule and its cap, send gating, routing, pings, clock sync with an outlier, fatal and non-fatal errors, kicks, malformed frames) and the room codes. The relay's own tests, including a WebSocket end-to-end run, live in `services/relay`.

It's used by **Encore** (the TV app in this repository): the phone on the table is the microphone, and every event it sends goes through couch-link.
