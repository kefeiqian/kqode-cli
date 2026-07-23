import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tuiRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(tuiRoot, 'src');

export default defineConfig({
  // Inject the build-env flags so `__TEST__`-gated seams are active under Vitest.
  define: {
    __TEST__: 'true',
    __DEV__: 'false',
    __PROD__: 'false'
  },
  resolve: {
    alias: {
      '@': srcRoot,
      '@backend': path.join(srcRoot, 'backend'),
      '@components': path.join(srcRoot, 'components'),
      '@constants': path.join(srcRoot, 'constants'),
      '@contracts': path.join(srcRoot, 'contracts'),
      '@hooks': path.join(srcRoot, 'hooks'),
      '@libs': path.join(srcRoot, 'libs'),
      '@state': path.join(srcRoot, 'state'),
      '@test': path.join(srcRoot, 'test'),
      '@theme': path.join(srcRoot, 'theme')
    }
  },
  test: {
    environment: 'node',
    // Disable backend debug logging for the integration tests that spawn the
    // real Rust backend, so they never write under the real `~/.kqode/logs`
    // (the dev build defaults it on). buildHardenedEnv allowlists KQODE_DEBUG.
    env: {
      KQODE_DEBUG: '0'
    }
  }
});
