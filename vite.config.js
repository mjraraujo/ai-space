import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

function copyAssetsPlugin() {
  return {
    name: 'copy-pwa-assets',
    writeBundle(options) {
      const outDir = options.dir || 'dist';

      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      const filesToCopy = ['sw.js', 'manifest.json'];
      for (const file of filesToCopy) {
        const src = resolve(__dirname, file);
        const dest = resolve(outDir, file);
        if (existsSync(src)) {
          writeFileSync(dest, readFileSync(src, 'utf-8'));
        }
      }

      // Copy public/icons (all files)
      const iconsDir = resolve(outDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      const iconsSrc = resolve(__dirname, 'public/icons');
      if (existsSync(iconsSrc)) {
        for (const file of readdirSync(iconsSrc)) {
          const srcFile = resolve(iconsSrc, file);
          const destFile = resolve(iconsDir, file);
          writeFileSync(destFile, readFileSync(srcFile));
        }
      }
    }
  };
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.js']
  },
  base: '/ai-space/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild'
  },
  plugins: [copyAssetsPlugin()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
