import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { config } from '../config';
import { parseReport, useCrowdFeed, type CrowdMessage, type CrowdScene } from './crowdFeed';
import { colors } from './theme';

export const CROWD_STAGE_AVAILABLE = true;

type Frame = { contentWindow?: { postMessage(msg: unknown, origin: string): void } | null };
type Listen = (type: string, fn: (e: { data: unknown; source?: unknown }) => void) => void;
const page = globalThis as unknown as { addEventListener?: Listen; removeEventListener?: Listen };

/**
 * The live 3D crowd in the browser preview: the crowd page in an iframe, fed the same messages as the TV's WebView.
 * Messages are posted as objects (structured clone); the page's own reports arrive on the window.
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
  const frame = useRef<Frame | null>(null);
  const attach = useCallback((el: Frame | null) => {
    frame.current = el;
  }, []);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const post = useCallback((msg: CrowdMessage) => {
    const win = frame.current && frame.current.contentWindow;
    if (win) win.postMessage(msg, '*');
  }, []);
  useCrowdFeed(scene, ready, epoch, post);
  useEffect(() => {
    if (!page.addEventListener || !page.removeEventListener) return undefined;
    const onMessage = (e: { data: unknown; source?: unknown }) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const report = parseReport(e.data);
      if (report && report.type === 'ready') {
        if (visibleRef.current) visibleRef.current();
        setReady(true);
        setEpoch((n) => n + 1);
      } else if (report && report.type === 'thumb' && thumbRef.current) {
        thumbRef.current(report.key, report.uri);
      }
    };
    page.addEventListener('message', onMessage);
    const remove = page.removeEventListener;
    return () => remove('message', onMessage);
  }, []);
  return (
    <View style={styles.fill} pointerEvents="none">
      {React.createElement('iframe', {
        ref: attach,
        src: url,
        title: 'crowd',
        // The room's sound plays in the page; the preview's first click or key press unlocks it for the frame too.
        allow: 'autoplay',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: colors.house },
        onLoad: () => {
          setReady(true);
          setEpoch((n) => n + 1);
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
