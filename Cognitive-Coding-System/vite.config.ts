import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: "0.0.0.0",

      hmr: process.env.DISABLE_HMR === 'true'
        ? { overlay: false }
        : {
            protocol: "ws",
            host: "localhost",
            clientPort: 3000,
            overlay: false,
          },

      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {},
    },
  };
});
