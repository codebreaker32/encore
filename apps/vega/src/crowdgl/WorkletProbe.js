/**
 * SPIKE (crowdgl, removable): can a GL render loop run off React's JS thread on Vega? expo-gl's generic GLView offers
 * `enableExperimentalWorkletSupport` (the context is reached from a Reanimated worklet on the UI runtime); its Vega view
 * (build/GLView.kepler.js) never reads the prop. This asks a worklet whether it can see the context at all, and if it can,
 * clears and presents a few frames from the UI thread. Results go to the log and to the screen (a Modal over the GL view).
 */
import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { GLView } from '@amazon-devices/expo-gl';
import { runOnJS, runOnUI } from 'react-native-reanimated';

export function WorkletProbe() {
  const [lines, setLines] = useState(['worklet probe: waiting for the GL context']);
  const log = useCallback((msg) => {
    console.log(`[worklet] ${msg}`);
    setLines((l) => [...l, msg]);
  }, []);
  const onContextCreate = useCallback(
    (gl) => {
      const id = gl.contextId;
      log(`JS thread: context ${id}, __EXGLContexts has it: ${!!(global.__EXGLContexts && global.__EXGLContexts[String(id)])}`);
      // the JS thread draws red so a UI-thread draw (green) would show as a change
      gl.clearColor(0.7, 0.1, 0.1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.endFrameEXP();
      const report = (msg) => log(msg);
      try {
        runOnUI((contextId) => {
          'worklet';
          const contexts = global.__EXGLContexts;
          const ctx = contexts ? contexts[String(contextId)] : undefined;
          if (!ctx) {
            runOnJS(report)(`UI thread: no GL context (__EXGLContexts ${contexts ? 'present' : 'undefined'})`);
            return;
          }
          let frames = 0;
          const t0 = Date.now();
          for (let i = 0; i < 60; i++) {
            ctx.clearColor(0.1, 0.6, 0.2, 1);
            ctx.clear(ctx.COLOR_BUFFER_BIT);
            ctx.endFrameEXP();
            frames++;
          }
          runOnJS(report)(`UI thread: drew ${frames} frames in ${Date.now() - t0} ms`);
        })(id);
        log('runOnUI scheduled');
      } catch (e) {
        log(`runOnUI threw: ${e && e.message}`);
      }
    },
    [log],
  );
  return (
    <View style={styles.fill}>
      <GLView style={styles.fill} enableExperimentalWorkletSupport onContextCreate={onContextCreate} />
      <Modal transparent visible animationType="none">
        <View pointerEvents="none" style={styles.panel}>
          {lines.map((l, i) => (
            <Text key={i} style={styles.line}>
              {l}
            </Text>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#07060a' },
  panel: { position: 'absolute', left: 60, right: 60, bottom: 60, padding: 14, backgroundColor: 'rgba(7,6,10,0.7)' },
  line: { color: '#f3e3c3', fontSize: 26, lineHeight: 34 },
});
