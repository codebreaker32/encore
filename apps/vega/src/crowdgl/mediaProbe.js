/**
 * SPIKE (crowdgl, temporary): can w3cmedia play media packaged with the app? Amazon's forum answers suggest
 * `asset://<path under assets/>` (thread 25179) and, the one confirmed to work for video (thread 27642, March 2026),
 * files in the app's `assets/raw/` opened by the plain path `/pkg/assets/raw/<file>`. Each candidate gets its own
 * AudioPlayer in turn; `ended` means it played (the room's null sink records whether it was audible).
 * The copies under assets/raw/ come from the box step in docs/dev-setup.md ("Vega on AWS", crowdgl).
 */
import { AudioPlayer } from '@amazon-devices/react-native-w3cmedia';

const CANDIDATES = [
  '/pkg/assets/raw/media/sounds/laugh-big.mp3',
  '/pkg/assets/raw/murmur.mp3',
  'file:///pkg/assets/raw/murmur.mp3',
  'asset://raw/murmur.mp3',
  'asset://murmur.mp3',
];

let ran = false;
export function probePackagedMedia(log) {
  if (ran) return;
  ran = true;
  const next = (i) => {
    if (i >= CANDIDATES.length) return;
    const uri = CANDIDATES[i];
    const p = new AudioPlayer();
    p.initialize()
      .then(() => {
        p.addEventListener('ended', () => log(`media ${i} ended (duration ${p.duration}) ${uri}`));
        p.volume = 1;
        p.src = uri;
        p.load();
        p.play().catch(() => undefined);
        setTimeout(() => {
          log(`media ${i} after 7 s: time ${p.currentTime}, duration ${p.duration}, error ${JSON.stringify(p.error)} · ${uri}`);
          p.deinitialize()
            .catch(() => undefined)
            .then(() => next(i + 1));
        }, 7000);
      })
      .catch((e) => {
        log(`media ${i} init failed ${String(e)}`);
        next(i + 1);
      });
  };
  setTimeout(() => next(0), 4000);
}
