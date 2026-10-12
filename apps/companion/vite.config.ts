import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const RELAY = process.env.RELAY_URL ?? 'ws://localhost:8787';

// Phones only allow microphone access on secure pages, so the dev server uses a self-signed
// certificate (accept the warning once on the phone). The page then has to use wss://, so the
// relay is proxied through this same origin at /relay instead of being reached directly.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/relay': { target: RELAY, ws: true, rewrite: () => '/' } },
  },
  preview: { host: true, port: 4173 },
});
