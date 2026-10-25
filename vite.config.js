import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run start` serves plain HTTP (localhost is a secure context, so the
// laptop webcam works). `npm run start:lan` adds a self-signed HTTPS cert so a
// phone / second laptop on the same Wi-Fi can open optic-depth.html and be
// granted camera access (browsers block getUserMedia on non-localhost HTTP).
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan' || process.env.KANHA_HTTPS === '1';
  return {
    plugins: lan ? [basicSsl({ name: 'kanha-spatial-os' })] : [],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        // The Neural Relay (port 8081) is reachable through the Vite origin so
        // pages use ws:// or wss:// automatically, matching the page protocol.
        '/neural': { target: 'http://localhost:8081', ws: true, changeOrigin: true }
      }
    },
    preview: { host: true, port: 4173 },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          opticPrimary: resolve(import.meta.dirname, 'gesture-service/optic-primary.html'),
          opticDepth: resolve(import.meta.dirname, 'gesture-service/optic-depth.html')
        }
      }
    }
  };
});
