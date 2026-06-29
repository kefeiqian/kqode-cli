import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'ink';
import { App } from '@/App.js';
import { readGitStatusLabel } from '@libs/git/gitStatus.js';
import { resolveRepoRoot, resolveWorkspaceCwd } from '@libs/path/runtimePaths.js';
import { readProductVersion } from '@libs/product/productMetadata.js';

const tuiPackageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot(tuiPackageRoot);
const workspaceCwd = resolveWorkspaceCwd();
const productVersion = readProductVersion(repoRoot);
const gitStatusLabel = readGitStatusLabel(workspaceCwd);

render(
  <App screen={{ productVersion, workspaceCwd, gitStatusLabel }} />
);
