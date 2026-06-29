import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRepoRoot, resolveWorkspaceCwd } from '@libs/path/runtimePaths.js';

describe('runtime path resolution', () => {
  it('resolves the repo root from the TUI package root', () => {
    const repoRoot = path.resolve('KQode');
    const tuiRoot = path.join(repoRoot, 'tui');

    expect(resolveRepoRoot(tuiRoot)).toBe(path.normalize(repoRoot));
  });

  it('normalizes the workspace cwd used for display', () => {
    const workspace = path.join('target', 'kqode-test-workspaces', 'workspace');

    expect(resolveWorkspaceCwd(workspace)).toBe(path.normalize(workspace));
  });
});
