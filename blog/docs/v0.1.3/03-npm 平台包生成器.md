---
sidebar_position: 3
title: 3. npm 平台包生成器
---

[`4ccd30a3`](https://github.com/kefeiqian/KQode/commit/4ccd30a3) 新增了平台包生成器。它解决的问题是：平台包必须发布到 npm，但它们不应该作为五份重复二进制提交进 Git 仓库。KQode 已经有 GitHub Release archive；npm 平台包应该从这些 release artifact 派生，而不是成为另一套源头。

![平台包生成器从 Release archives 组装 npm packages](../images/v0-1-3-platform-package-generator/generator-from-release-archives.png)

## 为什么发布时生成，而不是提交 dist-packages

如果把 `@kqode/kqode-cli-linux-x64` 这类目录直接提交到仓库，会出现三个问题。

第一，仓库会开始存放 release binary。KQode 的源码仓库应该保存源码、脚本和配置；大型产物属于 GitHub Release 和 npm registry。第二，平台包内容和 release archive 可能漂移：某次 release archive 重新生成了 checksum，但提交的 dist package 没变，两个渠道就不再是同一个 binary。第三，平台包数量会增长，提交产物会让 review 变得噪声很大。

因此生成器的定位很清楚：输入是已发布的 `kqode-<target>.<ext>` 和 `.sha256`，输出是可 `npm publish` 的临时 package 目录。源码仓库只维护“如何生成”的逻辑。

## buildPackage：每个平台包都是一个可验证的派生产物

[`packaging/npm/scripts/generate-platform-packages.cjs`](https://github.com/kefeiqian/KQode/blob/4ccd30a3/packaging/npm/scripts/generate-platform-packages.cjs) 的核心是 `buildPackage`：

```js
function buildPackage({ platform, arch, version, archivesDir, outDir }) {
  const name = platformPackageName(platform, arch);
  const bin = binaryName(platform);
  const relName = releaseTargetName(platform, arch);
  const ext = archiveExt(platform);
  const archivePath = path.join(archivesDir, `${relName}.${ext}`);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`release archive not found: ${archivePath}`);
  }
  verifyChecksum(archivePath, path.join(archivesDir, `${relName}.sha256`));
```

这段代码先把 npm 平台 key 映射到 Release asset 名，再验证 checksum。为什么生成 npm 包前还要验一次 SHA-256？因为 CI 下载 Release asset 后，不能默认认为 staging 目录里的文件完整且匹配。checksum 是 release channel 的公开契约；npm channel 既然复用同一个 artifact，就应该重新校验这个契约。

继续看它如何复制可执行文件和 license：

```js
const manifest = platformPackageManifest({ name, version, platform, arch, binaryName: bin });
fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(pkgDir, 'README.md'), platformPackageReadme({ name, platform, arch }));
for (const license of LICENSE_FILES) {
  fs.copyFileSync(path.join(packageRoot, license), path.join(pkgDir, license));
}
return { name, dir: pkgDir };
```

平台包不是一个随便能运行的文件夹；它需要 npm metadata、README、license 和实际 binary。把这些都从脚本生成，有两个好处：manifest 结构可测试，所有平台包形状一致。

## platform-package.cjs：平台包没有 bin，只有 files

[`packaging/npm/scripts/platform-package.cjs`](https://github.com/kefeiqian/KQode/blob/4ccd30a3/packaging/npm/scripts/platform-package.cjs) 生成 platform package 的 `package.json`：

```js
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
    files: [binaryName, ...LICENSE_FILES, 'README.md'],
    preferUnplugged: true,
    engines: { node: '>=18' }
  };
}
```

这里有几个刻意的设计。平台包声明 `os` / `cpu`，让 npm 负责平台筛选；平台包没有 `bin`，只有 launcher package 暴露 `kqode` 命令；平台包没有 restrictive `exports`，因为 launcher 需要 `require.resolve('<pkg>/package.json')` 定位 package root；`preferUnplugged: true` 是为了 Yarn PnP 一类环境不要把 executable 留在 zip 虚拟文件系统里。

## release-target.cjs：运行时平台名和 Release 文件名不是一回事

[`packaging/npm/scripts/release-target.cjs`](https://github.com/kefeiqian/KQode/blob/4ccd30a3/packaging/npm/scripts/release-target.cjs) 把 Node platform key 映射到 Release archive：

```js
const RELEASE_OS = { darwin: 'darwin', linux: 'linux', win32: 'windows' };

/**
 * Targets with no native archive that reuse another target's asset. Windows on
 * ARM has no native build yet; its package carries the Windows x64 executable,
 * which Windows 11 on ARM runs via emulation.
 */
const ASSET_OVERRIDES = { 'win32-arm64': { os: 'windows', arch: 'x64' } };
```

为什么这层映射不放进 `resolve.cjs`？因为 launcher runtime 只需要知道“当前 host 对应哪个 npm package”；它不应该知道“这个 npm package 的 binary 从哪个 GitHub Release archive 来”。后者是发布时的实现细节。把映射放在生成器侧，可以让运行时代码保持纯净。

## main：SUPPORTED_TARGETS 驱动生成

生成器最终遍历 runtime 暴露的目标列表：

```js
const written = SUPPORTED_TARGETS.map((target) => {
  const [platform, arch] = target.split('-');
  return buildPackage({ platform, arch, version, archivesDir, outDir });
});
```

这个选择让新增平台变成单点修改：先更新 `SUPPORTED_TARGETS`，再让 release workflow 产出对应 archive，generator 和 npm CI 自然跟上。如果生成器自己维护一份目标列表，就会重新引入漂移风险。

## 取舍：多包发布换来用户安装确定性

这个方案的代价很明确：每个 release 要发布六个 npm 包，npm Trusted Publisher 也要为每个包单独配置。KQode 接受这个成本，是因为它发生在维护者和 CI 侧；普通用户获得的是更简单的安装模型。安装完成后，`kqode` 不需要网络，不依赖 GitHub Release 可用性，也不会因为 install script 被禁用而缺 binary。
