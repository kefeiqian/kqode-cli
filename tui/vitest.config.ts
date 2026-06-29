import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tuiRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(tuiRoot, 'src');

export default defineConfig({
  resolve: {
    alias: {
      '@': srcRoot,
      '@components': path.join(srcRoot, 'components'),
      '@libs': path.join(srcRoot, 'libs'),
      '@state': path.join(srcRoot, 'state'),
      '@test': path.join(srcRoot, 'test'),
      '@theme': path.join(srcRoot, 'theme')
    }
  },
  test: {
    environment: 'node'
  }
});
