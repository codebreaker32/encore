import { Platform } from 'react-native';

/**
 * Where the TV finds the relay, the phone page and the MC. Edit for your network.
 *
 * - Browser preview (`yarn dev:tv-web`): same machine as the relay, so use its hostname.
 * - Google TV: `localhost` on Android after `adb reverse tcp:8787 tcp:8787` and `tcp:18080 tcp:8080`.
 * - Vega Virtual Device: `VVD_HOST`, the machine the simulator runs on. A physical Fire TV would need `LAN_HOST`.
 * - The phone URL must be reachable from the phone, so it is always the LAN address.
 *
 * shared-ui has no DOM types (it is typechecked through the Vega app), so the browser's location is read via globalThis.
 */
/** The laptop's address on the home Wi-Fi (Windows side). The phone reaches the phone page here. */
const LAN_HOST = '192.168.1.5';
/**
 * The Vega Virtual Device's view of the machine it runs on: the simulator is QEMU with user-mode networking, which maps
 * 10.0.2.2 to the host's loopback, so the relay and the MC beside it (laptop or build box) answer with no LAN setup.
 */
const VVD_HOST = '10.0.2.2';
const browser = globalThis as unknown as { location?: { hostname?: string; search?: string } };
/**
 * Where the TV reaches the relay and the MC: the browser's own host on web; `localhost` on Android, because the
 * laptop runs `adb reverse` for 8787, 8081 and 18080→8080 over the debugging link (works even with WSL in NAT mode); the
 * simulator's host elsewhere (Vega).
 */
const webHost =
  Platform.OS === 'web' && browser.location && browser.location.hostname
    ? browser.location.hostname
    : Platform.OS === 'android'
      ? 'localhost'
      : VVD_HOST;

export const config = {
  relayUrl: `ws://${webHost}:8787`,
  companionUrl: `https://${LAN_HOST}:5173/`,
  /** On Android the TV already listens on 8080 itself, so adb maps the TV's 18080 to the laptop's 8080. */
  mcUrl: Platform.OS === 'android' ? 'http://localhost:18080' : `http://${webHost}:8080`,
  /** How often the engine ticks while a set is live. */
  tickMs: 100,
  /** Debrief and chat: the MC service's own budget (MC_TIMEOUT_S). Past it the MC is silent and the screen says why. */
  mcTimeoutMs: 8000,
  /** A title-card line: the service's MC_LINE_TIMEOUT_S. A line that misses its moment simply never shows. */
  mcLineTimeoutMs: 3500,
  /**
   * Added to the client deadlines so the service's own `{ unavailable: { reason: 'timeout' } }` arrives (and the screen
   * can say "timed out") instead of the client giving up a beat earlier and reporting "unreachable".
   */
  mcGraceMs: 750,
  /** Who writes every MC word, as the cut sheet's source line says it. */
  mcModelLabel: 'GLM-5 on Amazon Bedrock',
  /** How many past sets the MC remembers (the green room says so). */
  memorySets: 6,
  /**
   * The live 3D crowd page, packed by `prototypes/crowd3d/tools/pack.mjs`. Android opens the copy the release bundle step
   * writes into `android/app/src/main/assets/crowd/`; Vega the one in `apps/vega/assets/crowd/` (its /pkg/assets); the
   * browser preview uses the prototype's own server on 8091. `host=1` makes the page take the engine's crowd drive
   * instead of running its own demo.
   */
  crowdUrl:
    Platform.OS === 'android'
      ? 'file:///android_asset/crowd/index.html?host=1&preset=tv'
      : Platform.OS === 'web'
        ? `http://${webHost}:8091/index.html?host=1`
        : 'file:///pkg/assets/crowd/index.html?host=1&preset=tv',
  /**
   * The live 3D crowd replaces the plates on every screen. On by default on Android TV (2026-10-12: the user rejects the
   * photo plates, and opening the app from the launcher must show the room, not only a test link; `stage?crowd=off`
   * turns it off); the browser preview turns it on with `?crowd=3d`. Vega waits on `CROWD_STAGE_AVAILABLE`.
   */
  crowd3d:
    Platform.OS === 'android' ||
    (Platform.OS === 'web' && /[?&]crowd=3d/.test((browser.location && browser.location.search) || '')),
};
