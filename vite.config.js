import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

      // Copy public/icons
      const iconsDir = resolve(outDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      const iconSrc = resolve(__dirname, 'public/icons/icon.svg');
      if (existsSync(iconSrc)) {
        writeFileSync(resolve(iconsDir, 'icon.svg'), readFileSync(iconSrc, 'utf-8'));
      }
    }
  };
}

export default defineConfig({
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
