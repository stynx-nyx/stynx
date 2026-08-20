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
  favicon:
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%23111827%22/%3E%3Cpath d=%22M8 10h16v3H18v9h-4v-9H8z%22 fill=%22%23f8fafc%22/%3E%3C/svg%3E',
  url: 'https://stynx-nyx.github.io',
  baseUrl: '/stynx/',
  onBrokenLinks: 'throw',
  organizationName: 'stynx-nyx',
  projectName: 'stynx',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  themes: ['@docusaurus/theme-mermaid'],
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
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
        // /docs/start is the canonical landing (slug: / in front matter).
        { to: '/docs/adopters/stynx/', label: 'Use STYNX', position: 'left' },
        { to: '/docs/framework/', label: 'Framework', position: 'left' },
        { to: '/docs/api-reference/', label: 'API', position: 'left' },
        { to: '/docs/adopters/', label: 'Adopters', position: 'left' },
        { to: '/docs/adopters/stynx/release-readiness', label: 'Status', position: 'left' },
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
            { label: 'Glossary', to: '/docs/glossary/' },
          ],
        },
        {
          title: 'Engineering Status',
          items: [
            { label: 'Release readiness', to: '/docs/adopters/stynx/release-readiness' },
            { label: 'Implementation status', to: '/docs/adopters/stynx/implementation-status' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Antonio A. Russo (<a href="mailto:aarusso@nyxk.com.br" style="color:inherit;text-decoration:underline">aarusso@nyxk.com.br</a>).<br/>STYNX — a multi-tenant platform foundation of reusable backend and Angular libraries for building governed SaaS applications. ${coreMajorLabel}<br/>Built with Docusaurus.`,
    },
  },
};

module.exports = config;
