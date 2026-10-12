// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

// expo-gl spikes (src/spike/GlSpike.js and src/crowdgl/, removable): three r160 (with a hookable renderer, src/crowdgl/three)
// and the people GLBs from prototypes/crowd3d, and a shim for the two expo-modules-core classes
// @amazon-devices/expo-gl imports without declaring the package. Both names go through
// extraNodeModules: a `resolveRequest` here is dropped, because the React Native CLI merges its out-of-tree platform
// resolver (react-native -> @amazon-devices/react-native-kepler) over the app's config.
const CROWD3D = path.resolve(__dirname, '../../prototypes/crowd3d');
// The crowdgl screens (and through them prototypes/crowd3d) are bundled only for a harness build, run with CROWDGL=1;
// an Encore build gets src/crowdgl/off, so a browser-only change in the prototype can't break it.
const CROWDGL_SCREENS = path.resolve(__dirname, 'src/crowdgl', process.env.CROWDGL ? 'harness' : 'off');
const defaults = getDefaultConfig(__dirname);

/**
 * Metro configuration for Vega workspace
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    path.resolve(__dirname, '../../packages/shared-ui'),
    path.resolve(__dirname, '../../packages/couch-link'),
    path.resolve(__dirname, '../../packages/crowd'),
    CROWD3D,
  ],
  resolver: {
    unstable_enableSymlinks: true,
    assetExts: [...defaults.resolver.assetExts, 'glb'],
    sourceExts: ['vega.tsx', 'vega.ts', 'vega.js', 'tsx', 'ts', 'jsx', 'js', 'json'],
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../../node_modules'),
    ],
    extraNodeModules: (function() {
      const modules = {
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-native': path.resolve(__dirname, 'node_modules/react-native'),
        '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
        three: path.resolve(__dirname, 'src/crowdgl/three'),
        'encore-crowdgl': CROWDGL_SCREENS,
        'expo-modules-core': path.resolve(__dirname, 'src/spike/expo-modules-core'),
      };

      // Map navigation packages to Amazon Devices ports for Vega
      const navigationMappings = {
        '@react-navigation/native': '@amazon-devices/react-navigation__native',
        '@react-navigation/native-stack': '@amazon-devices/react-navigation__native-stack',
        '@react-navigation/drawer': '@amazon-devices/react-navigation__drawer',
        '@react-navigation/core': '@amazon-devices/react-navigation__core',
        '@react-navigation/routers': '@amazon-devices/react-navigation__routers',
        '@react-navigation/elements': '@amazon-devices/react-navigation__elements',
      };

      // Map system libs to Amazon Devices versions
      const systemMappings = {
        'react-native-gesture-handler': '@amazon-devices/react-native-gesture-handler',
        'react-native-reanimated': '@amazon-devices/react-native-reanimated',
        'react-native-safe-area-context': '@amazon-devices/react-native-safe-area-context',
        'react-native-screens': '@amazon-devices/react-native-screens',
      };

      // Apply mappings - ensure we're resolving to vega's node_modules
      Object.keys(navigationMappings).forEach(key => {
        const target = path.resolve(__dirname, 'node_modules', navigationMappings[key]);
        modules[key] = target;
      });

      Object.keys(systemMappings).forEach(key => {
        const target = path.resolve(__dirname, 'node_modules', systemMappings[key]);
        modules[key] = target;
      });

      return modules;
    })(),
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['native', 'ios', 'android', 'tv'],
    blockList: [
      // Block standard react-navigation packages from parent node_modules
      new RegExp(
        path.resolve(__dirname, '..', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')
      ),
      // Block standard gesture handler from parent node_modules
      new RegExp(
        path.resolve(__dirname, '..', 'node_modules', 'react-native-gesture-handler').replace(/[/\\]/g, '[/\\\\]')
      ),
      // Block standard reanimated from parent node_modules
      new RegExp(
        path.resolve(__dirname, '..', 'node_modules', 'react-native-reanimated').replace(/[/\\]/g, '[/\\\\]')
      ),
      // Block standard screens from parent node_modules
      new RegExp(
        path.resolve(__dirname, '..', 'node_modules', 'react-native-screens').replace(/[/\\]/g, '[/\\\\]')
      ),
      // Block standard safe-area-context from parent node_modules
      new RegExp(
        path.resolve(__dirname, '..', 'node_modules', 'react-native-safe-area-context').replace(/[/\\]/g, '[/\\\\]')
      ),
    ],
  },
};

module.exports = mergeConfig(defaults, config);
