// The pure-JS QR encoder inside the `qrcode` package, without its canvas/terminal renderers.
declare module 'qrcode/lib/core/qrcode' {
  export interface QrSymbol {
    modules: { size: number; data: Uint8Array; get(row: number, col: number): number };
    version: number;
  }
  export function create(
    data: string | { data: Uint8Array; mode: 'byte' | 'numeric' | 'alphanumeric' }[],
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number },
  ): QrSymbol;
}
