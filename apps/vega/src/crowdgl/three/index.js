// SPIKE (crowdgl): `three` for the Vega bundle (metro.config.js extraNodeModules) is the crowd prototype's vendored
// r160, with WebGLRenderer replaced by a subclass the native harness can hook (renderer.js). One instance for everyone:
// the crowd modules, the vendored addons (which import 'three') and the harness.
export * from '../../../../../prototypes/crowd3d/vendor/three/build/three.module.min.js';
export { WebGLRenderer } from './renderer.js';
