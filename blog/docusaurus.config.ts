import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {themes as prismThemes} from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const config: Config = {
  title: 'KQode',
  tagline: 'Build journal and project notes',

  url: 'https://kefeiqian.github.io',
  baseUrl: '/kqode-cli/',
  organizationName: 'kefeiqian',
  projectName: 'kqode-cli',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
    },
  },
  trailingSlash: false,

  future: {
    // Enable Docusaurus Faster (Rspack + SWC + Lightning CSS) for a much faster
    // dev server and warm restarts, without opting into `future.v4`. We keep
    // `ssgWorkerThreads` off because it is the only Faster flag that requires a
    // v4 flag (removeLegacyPostBuildHeadAttribute), and it only speeds up the
    // build-time SSG step — not the dev server. Leaving v4 off also keeps
    // `useCssCascadeLayers` disabled, so the custom Tailwind/theme CSS cascade
    // is unaffected.
    faster: {
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      rspackBundler: true,
      rspackPersistentCache: true,
      ssgWorkerThreads: false,
    },
  },

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-nH0MfJ44wi1dd7w6jinlyBgljjS8EJAh2JBoRad8a3VDw2K69vfaaqm4WnR+gXtA',
      crossorigin: 'anonymous',
    },
  ],

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans', 'en'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
      en: {
        label: 'English',
        htmlLang: 'en-US',
      },
    },
  },

  plugins: [
    './src/plugins/tailwind-config.cjs',
    './src/plugins/dev-watch-poll.cjs',
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        theme: {
          customCss: ['./src/css/custom.css', './src/css/theme-surfaces.css'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    // Algolia DocSearch domain-ownership verification (Meta Tag method).
    // github.io is owned by GitHub, so the DNS/TXT method cannot be used. This
    // meta tag is injected on every page, so the crawler finds it at the start
    // URL https://kefeiqian.github.io/kqode-cli/ . The content value comes from
    // the Algolia "Verify your domain" > Meta Tag tab. Safe to keep after
    // verification succeeds.
    metadata: [
      {name: 'algolia-site-verification', content: 'C0A874BCCAF381EC'},
    ],
    prism: {
      theme: prismThemes.palenight,
      darkTheme: prismThemes.palenight,
      // Bundled by prism-react-renderer: ts/tsx/js/jsx/rust/json/yaml/md/py/xml/text.
      // These three are not, so their fenced blocks render unhighlighted without this.
      additionalLanguages: ['bash', 'diff', 'toml'],
    },
    // Algolia DocSearch (navbar search box). The @docusaurus/theme-search-algolia
    // theme is already bundled by preset-classic, so no install is needed.
    // Apply for the free program at https://docsearch.algolia.com/apply/ ; once
    // approved you'll receive appId, a search-only apiKey (public, safe to commit),
    // and indexName. Paste them below and uncomment. contextualSearch keeps the
    // zh-Hans and en locale results separate. Search only returns results after
    // Algolia's first crawl of the deployed site completes.
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_ONLY_KEY',
    //   indexName: 'YOUR_INDEX_NAME',
    //   contextualSearch: true,
    // },
    navbar: {
      title: 'KQode',
      items: [
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/kefeiqian/kqode-cli',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
