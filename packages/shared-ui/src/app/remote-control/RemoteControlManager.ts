import mitt from 'mitt';
import { Platform } from 'react-native';
import { SupportedKeys } from './SupportedKeys';
import { RemoteControlManagerInterface } from './RemoteControlManager.interface';

const KEY_MAPPING: Record<string, SupportedKeys> = {
  ArrowRight: SupportedKeys.Right,
  ArrowLeft: SupportedKeys.Left,
  ArrowUp: SupportedKeys.Up,
  ArrowDown: SupportedKeys.Down,
  Enter: SupportedKeys.Enter,
  Backspace: SupportedKeys.Back,
  GoBack: SupportedKeys.Back, // For LG WebOS Magic Remote
};

interface BrowserKeyEvent {
  code: string;
  key: string;
}

class RemoteControlManager implements RemoteControlManagerInterface {
  private eventEmitter = mitt<{ keyDown: SupportedKeys }>();

  constructor() {
    // No DOM lib in shared-ui (it is typechecked through the Vega app), so reach the browser window through globalThis.
    const win = Platform.OS === 'web' ? (globalThis as unknown as { addEventListener?: (type: string, cb: (e: BrowserKeyEvent) => void) => void }) : undefined;
    if (win && win.addEventListener) {
      win.addEventListener('keydown', this.handleKeyDown);
    }
  }

  private handleKeyDown = (event: BrowserKeyEvent): void => {
    const mappedKey = KEY_MAPPING[event.code] || KEY_MAPPING[event.key];
    if (mappedKey) {
      this.eventEmitter.emit('keyDown', mappedKey);
    }
  };

  addKeydownListener = (listener: (event: SupportedKeys) => void): ((event: SupportedKeys) => void) => {
    this.eventEmitter.on('keyDown', listener);
    return listener;
  };

  removeKeydownListener = (listener: (event: SupportedKeys) => void): void => {
    this.eventEmitter.off('keyDown', listener);
  };

  emitKeyDown = (key: SupportedKeys): void => {
    this.eventEmitter.emit('keyDown', key);
  };
}

export default new RemoteControlManager();