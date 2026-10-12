/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    // shared-ui's clips and sounds play from the package's assets/raw/ (w3cmedia can't open Metro's bundle assets)
    './tools/babel-plugin-raw-media',
    // Reanimated plugin must be listed last
    '@amazon-devices/react-native-reanimated/plugin',
  ],
};
