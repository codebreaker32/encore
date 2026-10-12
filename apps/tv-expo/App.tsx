import { useCallback, useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Linking, LogBox, Platform, StyleSheet, View } from 'react-native';
import { EncoreApp, fontAssets } from '@strumble/shared-ui';
import { CrowdTest, crowdTestUrl, stageLink } from './CrowdTest';

const KEEP_AWAKE_TAG = 'encore-set';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // A hard cut can unmount a <video> before its play() promise settles; Chrome then rejects with a benign AbortError
  // that react-native-video's web build does not catch. The cut is intended, so keep it out of the console.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string; message?: string } | undefined;
    if (reason && reason.name === 'AbortError' && /play\(\)/.test(String(reason.message))) event.preventDefault();
  });
}

if (__DEV__) {
  // Deprecation noise from libraries using older React APIs; nothing we can act on.
  LogBox.ignoreLogs([
    /findNodeHandle is deprecated/,
    /findHostInstance_DEPRECATED is deprecated/,
    /Legacy Architecture/,
  ]);
  // On a TV the in-app warning banner sits over the room and cannot be dismissed from the remote; warnings still
  // reach the Metro console, where they belong.
  if (Platform.OS !== 'web') LogBox.ignoreAllLogs(true);
}

export default function App() {
  // Big Shoulders Display and Atkinson Hyperlegible Next, by family name (web and Android TV).
  const [loaded, error] = useFonts(fontAssets);
  // Device test: `com.strumble.tv://crowdtest` opens the 3D crowd prototype full screen instead of the app (see CrowdTest).
  const [testUrl, setTestUrl] = useState<string | null>(null);
  // `com.strumble.tv://stage?crowd=3d` (or `=off`) runs the whole app over the live 3D room for a device test.
  const [crowd3d, setCrowd3d] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onLink = (link: string | null) => {
      setTestUrl(crowdTestUrl(link));
      const stage = stageLink(link);
      if (stage !== undefined) setCrowd3d(stage);
    };
    Linking.getInitialURL().then(onLink);
    const sub = Linking.addEventListener('url', ({ url }) => onLink(url));
    return () => sub.remove();
  }, []);
  const exitTest = useCallback(() => setTestUrl(null), []);
  // The screen stays on while a set is armed or live (the TV's screensaver would otherwise start mid-set).
  const onAwake = useCallback((awake: boolean) => {
    if (awake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, []);
  if (testUrl) return <CrowdTest url={testUrl} onExit={exitTest} />;
  if (!loaded && !error) return <View style={styles.house} />;
  return <EncoreApp crowd3d={crowd3d} onAwake={onAwake} />;
}

const styles = StyleSheet.create({
  house: { flex: 1, backgroundColor: '#07060a' },
});
