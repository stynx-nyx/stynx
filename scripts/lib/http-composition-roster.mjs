// Closed producer identities. This roster does not confer runtime admission.
const roots = Object.freeze({
  reference: Object.freeze({
    source: 'reference/api/src/bootstrap.ts',
    rootModule: 'reference/api/src/app.module.ts',
    rootExport: 'AppModule',
  }),
  offlineE6: Object.freeze({
    source: 'reference/api/src/performance/offline-e6.ts',
    rootModule: 'reference/api/src/performance/offline-e6.module.ts',
    rootExport: 'OfflineE6ApplicationModule',
  }),
  offlineCTG9: Object.freeze({
    source: 'reference/api/src/performance/offline-ctg9.ts',
    rootModule: 'reference/api/src/performance/offline-ctg9.module.ts',
    rootExport: 'OfflineCTG9ApplicationModule',
  }),
  i18n: Object.freeze({
    source: 'reference/api/src/performance/i18n.ts',
    rootModule: 'reference/api/src/performance/i18n.module.ts',
    rootExport: 'I18nApplicationModule',
  }),
  privacy: Object.freeze({
    source: 'reference/api/src/performance/privacy.ts',
    rootModule: 'reference/api/src/performance/privacy.module.ts',
    rootExport: 'PrivacyApplicationModule',
  }),
  domain: Object.freeze({
    source: 'reference/api/src/performance/domain.ts',
    rootModule: 'reference/api/src/performance/domain.module.ts',
    rootExport: 'DomainApplicationModule',
  }),
});

export function httpComposition(rootId) {
  if (typeof rootId !== 'string' || !Object.hasOwn(roots, rootId)) {
    const error = new Error('Unsupported HTTP application composition');
    error.code = 'HTTP_COMPOSITION_INVALID';
    throw error;
  }
  const root = roots[rootId];
  return Object.freeze({
    id: rootId,
    source: root.source,
    emitted: `reference/api/dist/${root.source.slice(0, -3)}.js`,
    rootModule: root.rootModule,
    emittedRootModule: `reference/api/dist/${root.rootModule.slice(0, -3)}.js`,
    rootExport: root.rootExport,
    factoryExport: 'createReferenceApplication',
  });
}

export function isHttpComposition(rootId) {
  return typeof rootId === 'string' && Object.hasOwn(roots, rootId);
}

export function httpCompositionIds() {
  return Object.keys(roots);
}
