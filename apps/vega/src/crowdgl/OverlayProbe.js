/**
 * SPIKE (crowdgl, removable): can React Native views sit over an expo-gl GLView on Vega? One GLView (the first try,
 * six GLViews in a grid, crashed the app in libgwsi on the VVD) covers the left two thirds of the screen and clears to
 * red every frame. Labels are placed over it in different ways; a label that shows is above the GL surface:
 *   C · the GLView wrapped in its own View, the label a later sibling of the wrapper
 *   B · a later sibling with zIndex 10 and elevation 10
 *   D · inside a transparent Modal
 * and E, on the right, is the control: a KeplerVideoSurfaceView (the video plates' surface) with a label after it.
 * A (an unwrapped GLView with a later sibling) was tried in src/spike/GlSpike.js: its text panel never showed.
 *
 * Why it is expected to fail: expo-gl's Vega view (kepler/GLViewComponent.cpp) creates its SurfaceRenderObject with
 * keepAboveReferenceWindow = true, a separate native window above the app's own, and takes no props.
 */
import React, { useCallback } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { GLView } from '@amazon-devices/expo-gl';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';

const GW = 1280;
const GH = 1080;

function Label({ text, style }) {
  return (
    <View pointerEvents="none" style={[styles.label, style]}>
      <Text style={styles.labelText}>{text}</Text>
    </View>
  );
}

export function OverlayProbe() {
  const onContextCreate = useCallback((gl) => {
    console.log(`[overlay] GL context (drawingBuffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight})`);
    const frame = () => {
      gl.viewport(0, 0, GW, GH);
      gl.clearColor(0.75, 0.1, 0.12, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.endFrameEXP();
      requestAnimationFrame(frame);
    };
    frame();
  }, []);
  return (
    <View style={styles.root}>
      <View collapsable={false} style={styles.glWrap}>
        <GLView style={styles.gl} onContextCreate={onContextCreate} />
      </View>
      <Label text="C · later sibling of the wrapped GLView" style={{ left: 80, top: 160 }} />
      <Label text="B · zIndex 10 + elevation 10" style={{ left: 80, top: 420, zIndex: 10, elevation: 10 }} />
      <View style={styles.videoArea}>
        <KeplerVideoSurfaceView style={styles.fill} onSurfaceViewCreated={() => undefined} />
      </View>
      <Label text="E · over a video surface" style={{ left: GW + 60, top: 420 }} />
      <Text style={styles.note}>right: KeplerVideoSurfaceView (no player) · left: GLView clearing to red</Text>
      <Modal transparent visible animationType="none">
        <Label text="D · inside a transparent Modal" style={{ left: 80, top: 680 }} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#202020' },
  glWrap: { position: 'absolute', left: 0, top: 0, width: GW, height: GH, overflow: 'hidden' },
  gl: { width: GW, height: GH },
  videoArea: { position: 'absolute', left: GW, top: 120, width: 1920 - GW, height: 840, backgroundColor: '#303a30' },
  fill: { ...StyleSheet.absoluteFillObject },
  note: { position: 'absolute', left: GW + 20, top: 40, width: 600, color: '#f3e3c3', fontSize: 22 },
  label: { position: 'absolute', backgroundColor: '#000', borderColor: '#fff', borderWidth: 3, padding: 14 },
  labelText: { color: '#fff', fontSize: 34 },
});
