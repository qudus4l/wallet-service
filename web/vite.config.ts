import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs separately on :3000; in production NestJS serves this build
// from the same origin, so the app always calls relative /v1 paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/v1': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', sourcemap: false },
});
