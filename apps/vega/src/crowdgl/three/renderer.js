// SPIKE (crowdgl): the vendored WebGLRenderer, plus a hook so the harness can wrap render() (endFrameEXP, upscale).
import { WebGLRenderer as Base } from '../../../../../prototypes/crowd3d/vendor/three/build/three.module.min.js';

export const rendererHooks = { onCreate: null };

export class WebGLRenderer extends Base {
  constructor(parameters) {
    super(parameters);
    if (rendererHooks.onCreate) rendererHooks.onCreate(this, parameters);
  }
}
