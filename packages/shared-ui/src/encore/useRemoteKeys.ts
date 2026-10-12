import { useEffect, useRef } from 'react';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';

export { SupportedKeys };

/** Subscribe to Fire TV remote / keyboard keys for the lifetime of a component. */
export function useRemoteKeys(handler: (key: SupportedKeys) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (key: SupportedKeys) => latest.current(key);
    RemoteControlManager.addKeydownListener(listener);
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, []);
}
