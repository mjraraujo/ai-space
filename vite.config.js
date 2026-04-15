import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

function copyAssetsPlugin() {
  return {
    name: 'copy-pwa-assets',
    writeBundle(options, bundle) {
      const outDir = options.dir || 'dist';

      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      // Derive a short content hash from all output chunks for cache busting.
      const hash = createHash('sha1');
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') hash.update(chunk.code ?? '');
      }
      const buildHash = hash.digest('hex').slice(0, 8);

      const filesToCopy = ['manifest.json'];
      for (const file of filesToCopy) {
        const src = resolve(__dirname, file);
        const dest = resolve(outDir, file);
        if (existsSync(src)) {
          writeFileSync(dest, readFileSync(src, 'utf-8'));
        }
      }

      // Stamp sw.js with the derived build hash so deployments always bust the cache.
      const swSrc = resolve(__dirname, 'sw.js');
      if (existsSync(swSrc)) {
        const swContent = readFileSync(swSrc, 'utf-8').replace(
          /const CACHE_VERSION = '[^']*'/,
          `const CACHE_VERSION = 'ai-space-${buildHash}'`
        );
        writeFileSync(resolve(outDir, 'sw.js'), swContent);
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
  base: '/',
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
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
