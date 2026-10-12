// What `encore-crowdgl` resolves to in an Encore build (metro.config.js): no harness, so prototypes/crowd3d is not
// bundled and a browser-only change there (import.meta, for one, which hermesc rejects) can't break the app's build.
export const CrowdScreen = null;
export const OverlayProbe = null;
export const WorkletProbe = null;
