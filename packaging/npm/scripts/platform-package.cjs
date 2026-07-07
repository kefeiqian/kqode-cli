'use strict';

// Pure builders for the per-platform npm packages. No fs/network so the manifest
// shape stays trivially testable.

const REPOSITORY_URL = 'git+https://github.com/kefeiqian/kqode-cli.git';
const HOMEPAGE = 'https://github.com/kefeiqian/kqode-cli#readme';
const BUGS_URL = 'https://github.com/kefeiqian/kqode-cli/issues';
const LICENSE = 'MIT OR Apache-2.0';

/** LICENSE files copied into every platform package (must exist in the launcher package). */
const LICENSE_FILES = ['LICENSE-APACHE', 'LICENSE-MIT'];
const NOTICE_FILES = ['THIRD_PARTY_NOTICES.md'];
const PACKAGE_SUPPORT_FILES = [...LICENSE_FILES, ...NOTICE_FILES, 'README.md'];

/**
 * Builds the `package.json` object for `@kqode/kqode-cli-<platform>-<arch>`.
 *
 * The package carries a single self-contained executable and declares `os`/`cpu`
 * so npm installs it only on the matching host. It deliberately omits `exports`
 * (so the launcher can `require.resolve` its `package.json`) and `bin` (only the
 * launcher package exposes the `kqode` command). `preferUnplugged` stops Yarn PnP
 * from zipping the executable, which must stay a real file to be runnable.
 */
function platformPackageManifest({ name, version, platform, arch, binaryName }) {
  return {
    name,
    version,
    description: `The ${platform}-${arch} executable for @kqode/kqode-cli.`,
    license: LICENSE,
    repository: { type: 'git', url: REPOSITORY_URL },
    homepage: HOMEPAGE,
    bugs: { url: BUGS_URL },
    os: [platform],
    cpu: [arch],
    files: [binaryName, ...PACKAGE_SUPPORT_FILES],
    preferUnplugged: true,
    engines: { node: '>=18' }
  };
}

/** Short README shipped inside each platform package. */
function platformPackageReadme({ name, platform, arch }) {
  return [
    `# ${name}`,
    '',
    `The \`${platform}-${arch}\` executable for [\`@kqode/kqode-cli\`](https://www.npmjs.com/package/@kqode/kqode-cli).`,
    '',
    'It is installed automatically as an optional dependency of `@kqode/kqode-cli`',
    'on matching hosts. Install the CLI instead of this package directly:',
    '',
    '```bash',
    'npm install -g @kqode/kqode-cli',
    '```',
    ''
  ].join('\n');
}

module.exports = { platformPackageManifest, platformPackageReadme, LICENSE_FILES, NOTICE_FILES, PACKAGE_SUPPORT_FILES };
