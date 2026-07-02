import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Display components and shared UI state must reach the backend only through the
// injected BackendClient interface, never through process/launch mechanics.
const FORBIDDEN_REFERENCES = [
  'node:child_process',
  'backendProcess',
  'backendBuild',
  'createBackendClient',
  'BackendClientHandle',
  'processUtils',
  'launchSourceBackend',
  'tree-kill'
];

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '__tests__' ? [] : sourceFiles(entryPath);
      }
      return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
    });
}

describe('display and state layers stay free of backend process logic', () => {
  it('no component or state module imports process or launch code', () => {
    const files = [
      ...sourceFiles(path.join(srcRoot, 'components')),
      ...sourceFiles(path.join(srcRoot, 'state'))
    ];

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const reference of FORBIDDEN_REFERENCES) {
        expect(content.includes(reference), `${file} should not reference ${reference}`).toBe(false);
      }
    }
  });
});
