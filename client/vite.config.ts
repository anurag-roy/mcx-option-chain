import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Tanstack Router
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    // React
    react(),
    // Tailwind CSS
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, '../server'),
      '@shared': path.resolve(__dirname, '../server/shared'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${4000}`,
        changeOrigin: true,
      },
    },
  },
});
