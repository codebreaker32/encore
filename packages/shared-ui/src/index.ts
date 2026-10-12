// Encore TV app
export { EncoreApp } from './encore/EncoreApp';
export { config as encoreConfig } from './encore/config';
export { fontAssets } from './encore/world/theme';

// Platform plumbing kept from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
export { default as RemoteControlManager } from './app/remote-control/RemoteControlManager';
export { SupportedKeys } from './app/remote-control/SupportedKeys';
export { scaledPixels } from './hooks/useScale';
export * from './theme';
export { VideoHandler } from './utils/VideoHandler';
