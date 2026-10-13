import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from '@amazon-devices/webview';
import { config } from '../config';
import { parseReport, useCrowdFeed, type CrowdMessage, type CrowdScene } from './crowdFeed';
import { colors } from './theme';

/**
 * Off until the page is measured on the Vega simulator: the live screen keeps the plates on Vega meanwhile. The stage
 * below is written against @amazon-devices/webview 3.5 (Chromium, WebGL 2) and is the one to switch on.
 */
export const CROWD_STAGE_AVAILABLE = false;

interface Injectable {
  injectJavaScript(script: string): void;
}
interface PageEvent {
  nativeEvent: { data: string };
}

/**
 * The live 3D crowd on Vega: the packed page from the app's assets (`file:///pkg/assets/crowd/index.html`) in Vega's
 * WebView. Vega's WebView takes messages into the page only through `injectJavaScript`, so each message is posted on
 * the page's own window, where it arrives exactly as on Android; the page reports back with
 * `window.ReactNativeWebView.postMessage`.
 */
export function CrowdStage({
  scene,
  url = config.crowdUrl,
  onThumb,
  onVisible,
}: {
  scene: CrowdScene;
  url?: string;
  /** A snapshot of this set's room arrived (see `snap` in crowdFeed.ts). */
  onThumb?: (key: string, uri: string) => void;
  /**
   * The page has drawn its first frames (its first `ready`): the room can be shown. Until then the screens keep their
   * photographic plates, so a slow WebView start shows the plate, never a black frame.
   */
  onVisible?: () => void;
}) {
  const thumbRef = useRef(onThumb);
  thumbRef.current = onThumb;
  const visibleRef = useRef(onVisible);
  visibleRef.current = onVisible;
  const web = useRef<Injectable | null>(null);
  const attach = useCallback((r: Injectable | null) => {
    web.current = r;
  }, []);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const post = useCallback((msg: CrowdMessage) => {
    if (web.current)
      web.current.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`);
  }, []);
  useCrowdFeed(scene, ready, epoch, post);
  const source = useMemo(() => ({ uri: url }), [url]);
  const onLoad = useCallback(() => {
    setReady(true);
    setEpoch((n) => n + 1);
  }, []);
  const onMessage = useCallback((e: PageEvent) => {
    const report = parseReport(e.nativeEvent.data);
    if (!report) return;
    if (report.type === 'ready') {
      if (visibleRef.current) visibleRef.current();
      setReady(true);
      setEpoch((n) => n + 1);
    } else if (report.type === 'thumb') {
      if (thumbRef.current) thumbRef.current(report.key, report.uri);
    } else if (report.type === 'load') {
      console.log(`[crowd] page ${typeof report.line === 'string' ? report.line : ''}`);
    } else if (report.type === 'audio') {
      // With the stage on, the page is the room's only sound (CrowdSound renders no players), so its state matters.
      console.log(`[crowd] audio ${report.state}`);
    } else {
      console.log(
        `[crowd] ${report.fps.toFixed(0)} fps · ${report.ms.toFixed(1)} ms · ${report.calls} calls · ${report.tris} tris`,
      );
    }
  }, []);
  return (
    <View style={styles.fill} pointerEvents="none">
      <WebView
        ref={attach}
        source={source}
        style={styles.fill}
        javaScriptEnabled
        // The page plays the crowd's sound itself; nobody presses a key inside it to unlock audio.
        mediaPlaybackRequiresUserAction={false}
        onLoad={onLoad}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
