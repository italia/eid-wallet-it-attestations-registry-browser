import { defineConfig } from 'vite';

/** Relative base so GitHub Pages works both as user site and as project site. */
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: '/index.html',
  },
});
