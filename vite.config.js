import { defineConfig } from 'vite';

// base './' makes the build work on GitHub Pages under any repo name,
// so you never need to edit this file when you change the repo.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
