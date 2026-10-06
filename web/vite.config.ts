import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Reachable from other devices on the LAN (e.g. a second screen for rehearsal).
      host: true,
      proxy: {
        '/socket.io': { target: `http://localhost:${env.PORT || 3000}`, ws: true },
        '/media': `http://localhost:${env.PORT || 3000}`,
        '/api': `http://localhost:${env.PORT || 3000}`,
      },
    },
  };
});
