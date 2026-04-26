import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const corePackageJsonPath = resolve(configDir, '../packages/core/package.json');
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
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
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
          sidebarPath: './sidebars.mjs',
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
        { to: '/docs/packages', label: 'Docs', position: 'left' },
        { to: '/docs/packages', label: 'Packages', position: 'left' },
        { to: '/docs/api-reference', label: 'API', position: 'left' },
        { to: '/docs/specifications', label: 'Specifications', position: 'left' },
        { to: '/docs/architecture-decisions', label: 'ADRs', position: 'left' },
        { type: 'docsVersionDropdown', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Packages', to: '/docs/packages' },
            { label: 'Adoption Guide', to: '/docs/adoption-guide' },
            { label: 'Infrastructure Guide', to: '/docs/infrastructure-guide' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'Specifications', to: '/docs/specifications' },
            { label: 'API Reference', to: '/docs/api-reference' },
          ],
        },
      ],
    },
  },
};

export default config;
