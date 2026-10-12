/**
 * SPIKE (crowdgl, removable): the live 3D crowd rendered natively on Vega with @amazon-devices/expo-gl, and the probes
 * that decide whether it can replace the WebView stage. Open one with CROWDGL below (src/App.tsx shows it instead of
 * Encore). To remove: delete src/crowdgl/, the CROWDGL line in src/App.tsx and its block in metro.config.js.
 */
import React from 'react';

/**
 * null: Encore. 'overlay': can RN views sit over a GLView? 'crowd': the prototype's club under expo-gl. 'worklet':
 * can a Reanimated worklet draw into the GL context off the JS thread? A mode also needs the build run with the
 * environment variable CROWDGL=1 (`CROWDGL=1 corepack yarn build:vega:debug`), which bundles the screens and
 * prototypes/crowd3d.
 */
export const CROWDGL = null;

export function CrowdGl() {
  // metro.config.js maps this to ./harness when the build runs with CROWDGL=1, else to ./off (nulls)
  const screens = require('encore-crowdgl');
  const Screen =
    CROWDGL === 'overlay' ? screens.OverlayProbe : CROWDGL === 'worklet' ? screens.WorkletProbe : screens.CrowdScreen;
  if (!Screen) throw new Error(`CROWDGL is '${CROWDGL}' but the harness is not bundled: build with CROWDGL=1`);
  return <Screen />;
}
