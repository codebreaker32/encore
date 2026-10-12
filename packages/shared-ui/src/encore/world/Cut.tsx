import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

/** How long the black frame holds: a little over one frame at 60 Hz, so it survives a dropped frame. */
export const CUT_MS = 40;

/**
 * A hard cut. When `shotKey` changes, a full-screen black View covers the new shot for one frame, then lifts.
 * This world cuts; it never crossfades. The new children mount under the black so their plate decodes during it.
 */
export function Cut({
  shotKey,
  dip = true,
  children,
}: {
  shotKey: string;
  /** False over the live 3D room: the room makes its own cuts, and a black frame there flashes (slow JS on a TV). */
  dip?: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({ key: shotKey, black: false });
  if (state.key !== shotKey) {
    // Derived state: React applies this before painting, so the first frame of the new shot is black.
    setState({ key: shotKey, black: true });
  }
  useEffect(() => {
    if (!state.black) return undefined;
    const t = setTimeout(() => setState((s) => (s.key === state.key ? { key: s.key, black: false } : s)), CUT_MS);
    return () => clearTimeout(t);
  }, [state.black, state.key]);
  return (
    <>
      {children}
      {dip && state.black && <View pointerEvents="none" style={styles.black} />}
    </>
  );
}

const styles = StyleSheet.create({
  black: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
