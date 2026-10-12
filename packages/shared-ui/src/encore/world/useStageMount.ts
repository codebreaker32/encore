import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/** How long after the bill's first frame (and any interaction then running) the 3D stage's WebView is created. */
export const STAGE_MOUNT_DELAY_MS = 1500;

/** The next frame, or a frame's worth of time where there is no requestAnimationFrame. */
function nextFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb());
  else setTimeout(cb, 16);
}

/**
 * Whether the live 3D stage may mount yet. The first WebView starts Chromium on the main thread (it reads the WebView
 * library from disk), and at launch that sat on the window's focus path: on a cold disk Android waited 5 s for the
 * focus event, declared an ANR and killed the app (QA on the Android TV emulator, 2026-10-12, issue 1). So the stage
 * mounts only after the bill has painted: two frames, then `InteractionManager.runAfterInteractions`, then
 * `delayMs`. Until then (and until the page's first frames, see `CrowdStage`'s `onVisible`) the screens show their
 * photographic plates. Works the same on RN 0.72 (Vega) and 0.81 (where InteractionManager is deprecated but present).
 */
export function useStageMount(wanted: boolean, delayMs: number = STAGE_MOUNT_DELAY_MS): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!wanted || mounted) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let task: { cancel: () => void } | null = null;
    nextFrame(() =>
      nextFrame(() => {
        if (cancelled) return;
        task = InteractionManager.runAfterInteractions(() => {
          if (!cancelled) timer = setTimeout(() => setMounted(true), delayMs);
        });
      }),
    );
    return () => {
      cancelled = true;
      if (task) task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [wanted, mounted, delayMs]);
  return wanted && mounted;
}
