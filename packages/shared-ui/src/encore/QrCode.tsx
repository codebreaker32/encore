/// <reference path="./qrcode.d.ts" />
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { create as createQr } from 'qrcode/lib/core/qrcode';

/**
 * A QR code drawn with plain Views (react-native-svg does not render on the Vega simulator).
 * Each row is rendered as runs of dark/light modules to keep the view count low.
 * Data is passed as bytes so the encoder never needs TextEncoder (missing on older Hermes).
 */
export function QrCode({ value, module = 10 }: { value: string; module?: number }) {
  const rows = useMemo(() => {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
    const { modules } = createQr([{ data: bytes, mode: 'byte' }], { errorCorrectionLevel: 'M' });
    const out: { dark: boolean; length: number }[][] = [];
    for (let r = 0; r < modules.size; r++) {
      const runs: { dark: boolean; length: number }[] = [];
      for (let c = 0; c < modules.size; c++) {
        const dark = modules.data[r * modules.size + c] === 1;
        const last = runs[runs.length - 1];
        if (last && last.dark === dark) last.length += 1;
        else runs.push({ dark, length: 1 });
      }
      out.push(runs);
    }
    return out;
  }, [value]);

  return (
    <View style={[styles.quietZone, { padding: module * 2 }]} accessibilityLabel={`QR code for ${value}`}>
      {rows.map((runs, r) => (
        <View key={r} style={[styles.row, { height: module }]}>
          {runs.map((run, i) => (
            <View key={i} style={{ width: run.length * module, height: module, backgroundColor: run.dark ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  quietZone: { backgroundColor: '#fff', borderRadius: 8 },
  row: { flexDirection: 'row' },
});
