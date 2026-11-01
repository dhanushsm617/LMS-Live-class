import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies the API, media and WebSocket traffic so the browser sees ONE origin.
// That keeps the httpOnly auth cookie first-party and avoids CORS in development.
const API = process.env.VITE_API_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/media': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
});
