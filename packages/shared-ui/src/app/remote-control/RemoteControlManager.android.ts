import mitt from 'mitt';
import { BackHandler } from 'react-native';
import KeyEvent from 'react-native-keyevent';
import { SupportedKeys } from './SupportedKeys';
import { RemoteControlManagerInterface } from './RemoteControlManager.interface';

const KEY_CODE_MAPPING: Record<number, SupportedKeys> = {
  21: SupportedKeys.Left,
  22: SupportedKeys.Right,
  20: SupportedKeys.Down,
  19: SupportedKeys.Up,
  66: SupportedKeys.Enter,
  23: SupportedKeys.Enter,
  4: SupportedKeys.Back,
  67: SupportedKeys.Back,
  85: SupportedKeys.PlayPause,
  89: SupportedKeys.Rewind,
  90: SupportedKeys.FastForward,
};

/** The remote's Back can reach us twice (the activity's key event and BackHandler); one press is one Back. */
const BACK_DEDUPE_MS = 250;

class RemoteControlManager implements RemoteControlManagerInterface {
  private eventEmitter = mitt<{ keyDown: SupportedKeys }>();
  private lastBackAt = 0;
  private backSubscription: { remove(): void } = { remove: () => undefined };

  constructor() {
    KeyEvent.onKeyDownListener(this.handleKeyDown);
    // The remote's Back (KEYCODE_BACK) goes to the activity, which leaves the app unless a handler takes it. Encore
    // gives Back its own meaning on every screen (stop the set, cut sheet ⇄ green room; nothing on the bill), so it
    // always takes it and never lets Back close the app.
    this.backSubscription = BackHandler.addEventListener('hardwareBackPress', this.handleBack);
  }

  private handleBack = (): boolean => {
    this.emitBack();
    return true;
  };

  private emitBack(): void {
    const now = Date.now();
    if (now - this.lastBackAt < BACK_DEDUPE_MS) return;
    this.lastBackAt = now;
    console.log(`Key pressed: ${SupportedKeys.Back}`);
    this.eventEmitter.emit('keyDown', SupportedKeys.Back);
  }

  private handleKeyDown = (keyEvent: { keyCode: number }): void => {
    const mappedKey = KEY_CODE_MAPPING[keyEvent.keyCode];
    if (mappedKey === SupportedKeys.Back) {
      this.emitBack();
    } else if (mappedKey) {
      console.log(`Key pressed: ${mappedKey}`);
      this.eventEmitter.emit('keyDown', mappedKey);
    }
  };

  addKeydownListener = (listener: (event: SupportedKeys) => void): ((event: SupportedKeys) => void) => {
    this.eventEmitter.on('keyDown', listener);
    console.log('Key listener added');
    return listener;
  };

  removeKeydownListener = (listener: (event: SupportedKeys) => void): void => {
    this.eventEmitter.off('keyDown', listener);
    console.log('Key listener removed');
  };

  emitKeyDown = (key: SupportedKeys): void => {
    this.eventEmitter.emit('keyDown', key);
  };

  cleanup = (): void => {
    KeyEvent.removeKeyDownListener();
    this.backSubscription.remove();
  };
}

export default new RemoteControlManager();
