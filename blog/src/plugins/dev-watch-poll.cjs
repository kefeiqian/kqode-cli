// Makes the dev server's file watching reliable on platforms where native FS
// events are dropped (notably Windows, and WSL/Docker bind mounts), so editing
// the body of an existing doc hot-reloads without a manual restart.
//
// Polling only matters while watching, i.e. `docusaurus start`. Production
// `build` runs with NODE_ENV=production and never watches, so this returns an
// empty config there and adds zero overhead to builds. The returned object is
// intentionally bundler-agnostic (only `watchOptions`), so it works whether the
// Webpack or the Rspack ("Docusaurus Faster") bundler is active.
module.exports = function devWatchPollPlugin() {
  return {
    name: 'dev-watch-poll',
    configureWebpack() {
      if (process.env.NODE_ENV === 'production') {
        return {};
      }
      return {
        watchOptions: {
          poll: 1000,
          aggregateTimeout: 300,
          ignored: ['**/node_modules/**', '**/.docusaurus/**', '**/build/**'],
        },
      };
    },
  };
};
