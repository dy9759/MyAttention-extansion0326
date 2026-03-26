import { defineConfig, type PluginOption } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';
import { copyFileSync } from 'node:fs';

const copyManifestPlugin: PluginOption = {
  name: 'copy-manifest',
  apply: 'build',
  closeBundle() {
    copyFileSync(
      resolve(__dirname, 'public/manifest.json'),
      resolve(__dirname, 'dist/manifest.json'),
    );
  },
};

export default defineConfig({
  plugins: [
    legacy({
      targets: ['Chrome >= 108', 'Edge >= 112', 'Safari >= 16'],
      polyfills: ['es.array.iterator', 'es.string.iterator'],
    }),
    copyManifestPlugin,
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo: { name: string }) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'popup') {
            return 'popup.js';
          }
          return '[name].js';
        },
        chunkFileNames: '[name].[hash].js',
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  publicDir: 'public',
  server: {
    port: 3000,
    strictPort: true,
    hmr: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
