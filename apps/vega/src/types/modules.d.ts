// Untyped JS modules inherited from the sample (resolved through tsconfig "paths").
declare module 'react-native-pixel-perfect';
declare module 'react-native-keyevent';
// react-native-video is the Expo/Android player; Vega uses VideoPlate.vega.tsx (w3cmedia), but tsc does not do platform
// resolution, so the non-Vega VideoPlate.tsx is typechecked here against this stand-in.
declare module 'react-native-video';
declare module 'react-native-webview';
