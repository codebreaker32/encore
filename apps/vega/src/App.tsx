import React from 'react';
import { EncoreApp } from '@strumble/shared-ui';
import { GL_SPIKE, GlSpike } from './spike/GlSpike';
import { CROWDGL, CrowdGl } from './crowdgl/CrowdGl';

// Fonts: Vega resolves `fontFamily` by file name from apps/vega/assets/fonts/ (copies of shared-ui's TTFs), so nothing loads here.
export const App = () => (GL_SPIKE ? <GlSpike /> : CROWDGL ? <CrowdGl /> : <EncoreApp />);
