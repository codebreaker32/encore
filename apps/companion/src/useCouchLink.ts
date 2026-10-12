import { useCallback, useEffect, useRef, useState } from 'react';
import { CouchLinkClient, type ErrorCode, type Session, type Status } from 'couch-link';
import type { PhoneMessage, TvMessage } from '@strumble/crowd';

const SESSION_KEY = 'strumble.session';

function loadSession(room: string): Session | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return saved?.room === room ? saved : undefined;
  } catch {
    return undefined;
  }
}

function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode or blocked storage: resume-after-reload just won't work.
  }
}

/** Same-origin relay path (proxied by the dev server), so it works over HTTPS without mixed content. */
export function relayUrl(): string {
  return import.meta.env.VITE_RELAY_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`;
}

export interface PhoneConnection {
  status: Status;
  error?: { code: ErrorCode; message: string };
  tvOnline: boolean;
  /**
   * Subscribe to the TV's instructions. Every message is delivered, in order, synchronously; React
   * state would batch two messages that arrive together (a `stop` and the finale's `hush`) into one.
   */
  onCommand: (listener: (command: TvMessage) => void) => () => void;
  send: (msg: PhoneMessage) => void;
  serverNow: () => number;
}

/** Connects this phone to the TV's room and exposes the TV's latest instruction. */
export function usePhoneConnection(join: { room: string; name: string } | null): PhoneConnection {
  const clientRef = useRef<CouchLinkClient | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<PhoneConnection['error']>();
  const [tvOnline, setTvOnline] = useState(true);
  const commandListeners = useRef(new Set<(command: TvMessage) => void>());

  useEffect(() => {
    if (!join) return;
    const client = new CouchLinkClient({
      url: relayUrl(),
      role: { kind: 'player', room: join.room, name: join.name },
      resume: loadSession(join.room),
    });
    clientRef.current = client;
    const offs = [
      client.on('status', setStatus),
      client.on('session', saveSession),
      client.on('error', (code, message) => setError({ code, message })),
      client.on('hostStatus', setTvOnline),
      client.on('message', (from, data) => {
        if (from !== 'host') return;
        for (const listener of commandListeners.current) listener(data as TvMessage);
      }),
    ];
    setError(undefined);
    client.connect();
    return () => {
      offs.forEach((off) => off());
      client.close();
      clientRef.current = null;
    };
  }, [join]);

  // Stable identities, so effects and the listener can hold on to them.
  const send = useCallback((msg: PhoneMessage) => {
    clientRef.current?.send('host', msg);
  }, []);
  const serverNow = useCallback(() => clientRef.current?.serverNow() ?? Date.now(), []);
  const onCommand = useCallback((listener: (command: TvMessage) => void) => {
    commandListeners.current.add(listener);
    return () => {
      commandListeners.current.delete(listener);
    };
  }, []);

  return { status, error, tvOnline, onCommand, send, serverNow };
}
