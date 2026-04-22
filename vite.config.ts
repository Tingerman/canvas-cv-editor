import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Deployed as GitHub Pages at https://tingerman.github.io/canvas-cv-editor/
// base must match the repo name when deploying to <user>.github.io/<repo>/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/canvas-cv-editor/' : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: { port: 5173, open: true }
});
