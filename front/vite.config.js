import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement (npm run dev), /api est relayé vers l'API locale :
// le navigateur parle à une seule origine, comme en production derrière nginx.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_URL || 'http://localhost:3000' },
  },
});
