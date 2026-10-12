import { Platform } from 'react-native';
import { reduceSet, type SetAction, type SetState } from '@strumble/crowd';

export interface TimedAction {
  /** Seconds since t = 0 on the phone's clock. */
  at: number;
  action: SetAction;
}

/** Replay phone messages into a live state with the TV ticking every 100 ms between them, exactly as a real set runs. */
export function replay(state: SetState, actions: TimedAction[]): SetState {
  let s = state;
  let clock = s.now;
  for (const { at, action } of actions) {
    while (clock + 0.1 < at && s.phase === 'live') {
      clock = Math.round((clock + 0.1) * 10) / 10;
      s = reduceSet(s, { type: 'tick', now: clock });
    }
    if (s.phase !== 'live') break;
    s = reduceSet(s, action);
    clock = Math.max(clock, at);
  }
  return s;
}

export type DemoMode = 'club' | 'arena' | 'cutsheet' | 'greenroom' | 'bill-live';

export interface Demo {
  mode: DemoMode;
  /** Fast-forward: the set starts this many seconds in (`?demo=club&t=180`). */
  t: number;
  /** Green room without a phone: OK asks this typed question (`&ask=…`), the performer's words, not the MC's. */
  ask?: string;
}

const MODES: DemoMode[] = ['club', 'arena', 'cutsheet', 'greenroom', 'bill-live'];

/**
 * The browser preview can play a fixture set in real time (`?demo=club`), so a browser shows reactions without a phone.
 * Web only; never on a device.
 */
export function readDemo(): Demo | null {
  if (Platform.OS !== 'web') return null;
  const browser = globalThis as unknown as { location?: { search?: string } };
  const search = browser.location && browser.location.search ? browser.location.search : '';
  if (!search) return null;
  const params: Record<string, string> = {};
  for (const pair of search.replace(/^\?/, '').split('&')) {
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    const value = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1));
    if (key) params[key] = value;
  }
  const mode = params.demo as DemoMode | undefined;
  if (!mode || MODES.indexOf(mode) < 0) return null;
  const t = Number(params.t);
  return { mode, t: isFinite(t) && t > 0 ? t : 0, ask: params.ask ? params.ask : undefined };
}

/** Split the fixture's messages into those already past `t` (replayed at once, with ticks) and those still to come. */
export function splitActions(actions: TimedAction[], t: number): { backlog: TimedAction[]; future: TimedAction[] } {
  const backlog: TimedAction[] = [];
  const future: TimedAction[] = [];
  for (const a of actions) {
    if (a.at <= t) backlog.push(a);
    else future.push(a);
  }
  return { backlog, future };
}

/** Deliver the remaining messages at their phone times against the relay clock. Returns a cancel function. */
export function scheduleActions(
  future: TimedAction[],
  startedAt: number,
  serverNow: () => number,
  dispatch: (action: SetAction) => void,
): () => void {
  const timers: number[] = [];
  for (const { at, action } of future) {
    const delay = Math.max(0, startedAt + at * 1000 - serverNow());
    timers.push(setTimeout(() => dispatch(action), delay) as unknown as number);
  }
  return () => timers.forEach((id) => clearTimeout(id));
}
