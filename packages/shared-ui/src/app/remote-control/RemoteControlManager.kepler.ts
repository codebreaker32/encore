import mitt from 'mitt';
import { BackHandler, type HWEvent } from 'react-native';
import { SupportedKeys } from './SupportedKeys';
import { RemoteControlManagerInterface } from './RemoteControlManager.interface';

// Map Vega/Kepler HWEvent eventType to SupportedKeys
const EVENT_TYPE_MAPPING: Record<string, SupportedKeys> = {
  left: SupportedKeys.Left,
  right: SupportedKeys.Right,
  down: SupportedKeys.Down,
  up: SupportedKeys.Up,
  select: SupportedKeys.Enter,
  back: SupportedKeys.Back,
  playpause: SupportedKeys.PlayPause,
  skip_backward: SupportedKeys.Rewind,
  skip_forward: SupportedKeys.FastForward,
};

/** Back can reach us twice on Vega (a TVEventHandler `back` and BackHandler); one press is one Back. */
const BACK_DEDUPE_MS = 250;

class RemoteControlManager implements RemoteControlManagerInterface {
  private eventEmitter = mitt<{ keyDown: SupportedKeys }>();
  private tvEventHandler: any;
  private lastBackAt = 0;
  private backSubscription: { remove(): void } = { remove: () => undefined };

  constructor() {
    // Vega's BackHandler exits the app when no subscription returns true (React Native for Vega 0.72, BackHandler).
    // Encore gives Back its own meaning on every screen and never lets it close the app.
    this.backSubscription = BackHandler.addEventListener('hardwareBackPress', this.handleBack);
    // Initialize TVEventHandler for Vega/Kepler platform
    // Import dynamically to avoid issues with types
    const { TVEventHandler } = require('react-native');
    this.tvEventHandler = new TVEventHandler();
    this.tvEventHandler.enable(this, this.handleHWEvent);
    console.log('[RemoteControlManager.kepler] TVEventHandler enabled');
  }

  private handleHWEvent = (_component: any, event: HWEvent): void => {
    // Only handle KEY_DOWN events (eventKeyAction = 0)
    // eventKeyAction: 0 = KEY_DOWN, 1 = KEY_UP, -1 = default
    if (event.eventKeyAction === 0 || event.eventKeyAction === undefined) {
      const mappedKey = EVENT_TYPE_MAPPING[event.eventType];
      if (mappedKey === SupportedKeys.Back) {
        this.emitBack();
      } else if (mappedKey) {
        console.log(`[Kepler] Key pressed: ${mappedKey} (eventType: ${event.eventType})`);
        this.eventEmitter.emit('keyDown', mappedKey);
      }
    }
  };

  private handleBack = (): boolean => {
    this.emitBack();
    return true;
  };

  private emitBack(): void {
    const now = Date.now();
    if (now - this.lastBackAt < BACK_DEDUPE_MS) return;
    this.lastBackAt = now;
    console.log(`[Kepler] Key pressed: ${SupportedKeys.Back}`);
    this.eventEmitter.emit('keyDown', SupportedKeys.Back);
  }

  addKeydownListener = (listener: (event: SupportedKeys) => void): ((event: SupportedKeys) => void) => {
    this.eventEmitter.on('keyDown', listener);
    console.log('[RemoteControlManager.kepler] Key listener added');
    return listener;
  };

  removeKeydownListener = (listener: (event: SupportedKeys) => void): void => {
    this.eventEmitter.off('keyDown', listener);
    console.log('[RemoteControlManager.kepler] Key listener removed');
  };

  emitKeyDown = (key: SupportedKeys): void => {
    this.eventEmitter.emit('keyDown', key);
  };

  cleanup = (): void => {
    this.tvEventHandler.disable();
    this.backSubscription.remove();
    console.log('[RemoteControlManager.kepler] TVEventHandler disabled');
  };
}

export default new RemoteControlManager();
