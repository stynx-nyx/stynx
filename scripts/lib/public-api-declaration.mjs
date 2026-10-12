const storageMetadata = Object.freeze([
  Object.freeze({
    packageName: '@stynx-nyx/offline-sync',
    declarationPath: 'offline-sync/src/storage-template.generated.d.ts',
    exportName: 'OFFLINE_STORAGE_TEMPLATE',
  }),
  Object.freeze({
    packageName: '@stynx-nyx/outbox',
    declarationPath: 'outbox/src/storage-template.generated.d.ts',
    exportName: 'OUTBOX_STORAGE_TEMPLATE',
  }),
]);

const packageVersion =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function normalizePublicApiDeclaration({
  packageName,
  declarationPath,
  packageVersion: version,
  source,
}) {
  const normalized = source.replace(/\r\n/gu, '\n').trim();
  const metadata = storageMetadata.find(
    (entry) => entry.packageName === packageName && entry.declarationPath === declarationPath,
  );
  if (!metadata) return normalized;

  const rows = [...normalized.matchAll(/^    readonly packageVersion: "([^"\r\n]+)";$/gmu)];
  if (
    !normalized.startsWith(`export declare const ${metadata.exportName}: {\n`) ||
    rows.length !== 1 ||
    (normalized.match(/\breadonly packageVersion:/gu) ?? []).length !== 1 ||
    !packageVersion.test(version) ||
    rows[0][1] !== version
  ) {
    throw new Error(
      `${packageName}: invalid or stale storage version declaration ${declarationPath}`,
    );
  }
  return normalized.replace(
    rows[0][0],
    '    readonly packageVersion: "__STYNX_PACKAGE_VERSION_METADATA__";',
  );
}
