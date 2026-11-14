import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sourceTags } from './tooling/source-tags.js';
export default defineConfig({
  plugins: [sourceTags(), react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001', '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } } },
});
