import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const tuiRoot = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = ts.readConfigFile(path.join(tuiRoot, 'tsconfig.json'), ts.sys.readFile);
if (tsconfig.error !== undefined) {
  throw new Error(ts.flattenDiagnosticMessageText(tsconfig.error.messageText, '\n'));
}
const configuredPaths = tsconfig.config.compilerOptions?.paths as
  | Record<string, string[]>
  | undefined;
const aliases = Object.fromEntries(
  Object.entries(configuredPaths ?? {}).flatMap(
    ([alias, targets]) => {
      const target = targets[0];
      return target === undefined
        ? []
        : [[alias.replace(/\/\*$/, ''), path.resolve(tuiRoot, target.replace(/\/\*$/, ''))]];
    }
  )
);

export default defineConfig({
  // Inject the build-env flags so `__TEST__`-gated seams are active under Vitest.
  define: {
    __TEST__: 'true',
    __DEV__: 'false',
    __PROD__: 'false'
  },
  resolve: {
    alias: aliases
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
