import { SupportedKeys } from './SupportedKeys';

// Define a type for the listener function
export type KeydownListener = (event: SupportedKeys) => void;

export interface RemoteControlManagerInterface {
  /** Returns the listener so callers can pass it back to removeKeydownListener. */
  addKeydownListener(listener: KeydownListener): KeydownListener;
  removeKeydownListener(listener: KeydownListener): void;
  emitKeyDown(key: SupportedKeys): void;
}