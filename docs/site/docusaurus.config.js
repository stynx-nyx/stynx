const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const corePackageJsonPath = resolve(__dirname, '../../packages/core/package.json');
const corePackageVersion = JSON.parse(readFileSync(corePackageJsonPath, 'utf8')).version;
const coreMajorLabel = `v${String(corePackageVersion).split('.')[0] ?? '0'}`;

function suppressKnownWebpackWarnings() {
  return {
    name: 'suppress-known-webpack-warnings',
    configureWebpack() {
      return {
        ignoreWarnings: [
          {
            module: /vscode-languageserver-types\/lib\/umd\/main\.js/u,
            message: /Critical dependency: require function is used in a way/u,
          },
        ],
      };
    },
  };
}

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'STYNX',
  tagline: 'Platform documentation, specifications, and API reference',
  favicon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%23111827%22/%3E%3Cpath d=%22M8 10h16v3H18v9h-4v-9H8z%22 fill=%22%23f8fafc%22/%3E%3C/svg%3E',
  url: 'https://aarusso-nyx.github.io',
  baseUrl: '/stynx/',
  // R15 W08: navbar + footer updated to 0.2.0 IA paths (navbar leads with
  // /docs/adopters/stynx/, /docs/framework/, /docs/framework/api/,
  // /docs/adopters/, /docs/meta/self-scorecard). Broken-link severity
  // attempted at 'throw' but reverted to 'warn' for R15 close: the
  // ~200 source-side brokens are pre-existing (predate R15) — predominantly
  // in versioned_docs/version-0.1.1/ (the legacy snapshot — by design
  // points at the 0.1.1 layout) and in synced package READMEs that
  // cross-reference now-renamed paths. R15 documents this in the
  // closeout as Plan.md R-2 residue + carries it forward as a future
  // content-cleanup round. Re-tighten to 'throw' is queued for that round.
  onBrokenLinks: 'warn',
  organizationName: 'stynx',
  projectName: 'stynx',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  themes: ['@docusaurus/theme-mermaid'],
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  plugins: [
    suppressKnownWebpackWarnings,
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsDir: '.generated/site-docs',
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
      },
    ],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          path: '.generated/site-docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.js',
          lastVersion: 'current',
          versions: {
            current: {
              label: coreMajorLabel,
              path: '',
              banner: 'none',
            },
          },
        },
        blog: false,
        pages: {},
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'STYNX',
      items: [
        // R15 W08: nav paths follow the 0.2.0 seven-section IA.
        // /docs/start is the canonical landing (slug: / in front matter).
        { to: '/docs/adopters/stynx/', label: 'Use STYNX', position: 'left' },
        { to: '/docs/framework/', label: 'Framework', position: 'left' },
        { to: '/docs/framework/api/', label: 'API', position: 'left' },
        { to: '/docs/adopters/', label: 'Adopters', position: 'left' },
        { to: '/docs/meta/self-scorecard', label: 'Status', position: 'left' },
        { type: 'docsVersionDropdown', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Use STYNX', to: '/docs/adopters/stynx/' },
            { label: 'Packages', to: '/docs/packages/' },
            { label: 'Web Packages', to: '/docs/packages-web/' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'API Reference', to: '/docs/api-reference/' },
            { label: 'Contracts', to: '/docs/framework/contracts/' },
            { label: 'Architecture', to: '/docs/framework/arch/' },
            { label: 'Glossary', to: '/docs/framework/glossary/' },
          ],
        },
        {
          title: 'Engineering Status',
          items: [
            { label: 'Self-scorecard', to: '/docs/meta/self-scorecard' },
            { label: 'Test Matrix', to: '/docs/meta/test-matrix' },
            { label: 'Aspect grid', to: '/docs/framework/aspect-grid' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Antonio A. Russo (<a href="mailto:aarusso@nyxk.com.br" style="color:inherit;text-decoration:underline">aarusso@nyxk.com.br</a>).<br/>STYNX — a multi-tenant platform foundation of reusable backend and Angular libraries for building governed SaaS applications. ${coreMajorLabel}<br/>Built with Docusaurus.`,
    },
  },
};

module.exports = config;
