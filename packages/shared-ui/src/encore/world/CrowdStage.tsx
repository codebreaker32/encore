import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { config } from '../config';
import { parseReport, useCrowdFeed, type CrowdMessage, type CrowdScene } from './crowdFeed';
import { pageVenueOf, stageShows } from './stageGate';
import { colors } from './theme';

/** What the stage needs from the WebView and its events (structural, so the Vega typecheck's module stub fits too). */
interface Postable {
  postMessage(data: string): void;
}
interface PageEvent {
  nativeEvent: { data: string };
}
interface LoadEvent {
  nativeEvent: { url?: string };
}
interface GoneEvent {
  nativeEvent: { didCrash?: boolean };
}

/** The live 3D crowd can run on this platform (Android TV: the system WebView, WebGL 2). */
export const CROWD_STAGE_AVAILABLE = true;

/**
 * The live 3D crowd (Expo Android): the crowd page in the system WebView, full frame, under the world's captions and
 * lower-third. It runs its own render loop in the WebView's Chromium, so React's JS thread only posts the engine's
 * crowd drive about ten times a second. Frame stats from the page go to the log (`ReactNativeJS`) for device tests.
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
   * Whether the room can be shown: true once a page loaded for the wanted room has drawn its first frames (its `ready`),
   * false again from a venue change until the page for the new room is ready, while any page load is under way, and
   * after the WebView's renderer is lost. While false the screens keep their photographic plates, so a slow WebView
   * start, a venue rebuild or a renderer loss shows the plate, never a black frame (stageGate.ts).
   */
  onVisible?: (visible: boolean) => void;
}) {
  const thumbRef = useRef(onThumb);
  thumbRef.current = onThumb;
  const visibleRef = useRef(onVisible);
  visibleRef.current = onVisible;
  const web = useRef<Postable | null>(null);
  // A stable ref callback: an inline one would be detached and re-attached on every engine tick.
  const attach = useCallback((r: Postable | null) => {
    web.current = r;
  }, []);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  // The room of the page that last said `ready` (null while a page loads), and the room of the page being loaded.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const loadingFor = useRef<string>('any');
  // A new WebView after the renderer process is lost (killed for memory, or crashed): the old view can't be used again.
  const [life, setLife] = useState(0);
  const visible = stageShows(readyFor, scene.venue);
  useEffect(() => {
    if (visibleRef.current) visibleRef.current(visible);
  }, [visible]);
  const post = useCallback((msg: CrowdMessage) => {
    if (web.current) web.current.postMessage(JSON.stringify(msg));
  }, []);
  useCrowdFeed(scene, ready, epoch, post);
  // A new `source` object on every tick could make the WebView reload the page; keep one per URL.
  const source = useMemo(() => ({ uri: url }), [url]);
  // A navigation committed (the first load, or the page reloading itself into another room): black until its ready.
  const onLoadStart = useCallback((e: LoadEvent) => {
    loadingFor.current = pageVenueOf(e.nativeEvent && e.nativeEvent.url);
    console.log(`[crowd] page load start · ${loadingFor.current}`);
    setReadyFor(null);
  }, []);
  const onLoadEnd = useCallback(() => {
    setReady(true);
    setEpoch((n) => n + 1);
  }, []);
  const onGone = useCallback((e: GoneEvent) => {
    console.log(
      `[crowd] renderer gone (${e.nativeEvent && e.nativeEvent.didCrash ? 'crashed' : 'killed'}): a new stage`,
    );
    loadingFor.current = 'any';
    setReadyFor(null);
    setReady(false);
    setLife((n) => n + 1);
  }, []);
  const onMessage = useCallback((e: PageEvent) => {
    const report = parseReport(e.nativeEvent.data);
    if (!report) return;
    if (report.type === 'ready') {
      setReadyFor(loadingFor.current);
      if (report.view) console.log(`[crowd] view ${report.view} · ${loadingFor.current}`);
      setReady(true);
      setEpoch((n) => n + 1);
    } else if (report.type === 'thumb') {
      if (thumbRef.current) thumbRef.current(report.key, report.uri);
    } else if (report.type === 'load') {
      console.log(`[crowd] page ${typeof report.line === 'string' ? report.line : JSON.stringify(report).slice(0, 600)}`);
    } else if (report.type === 'audio') {
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
        key={life}
        ref={attach}
        source={source}
        style={styles.fill}
        originWhitelist={['*']}
        javaScriptEnabled
        // The packed page opens from file:///android_asset and reads its people/ files over XHR.
        allowFileAccess
        allowFileAccessFromFileURLs
        // The room's sound plays in the page (WebAudio); without this it waits for a key press.
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        // No zoom-to-fit (wide viewport plus overview mode): the page fits its own stage to the WebView's size.
        scalesPageToFit={false}
        overScrollMode="never"
        focusable={false}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onRenderProcessGone={onGone}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
