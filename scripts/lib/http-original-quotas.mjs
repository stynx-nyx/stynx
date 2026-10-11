import { resolve } from 'node:path';
import YAML from 'yaml';
import { readHttpQualificationDeclaration } from './http-qualification-artifacts.mjs';

// Existing Compose fixture policy, not a new quota or a measurement admission.
const limits = Object.freeze({
  STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_READ_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_DELETE_LIMIT: '12000',
  STYNX_SAMPLE_RECORD_DELETE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT: '6000',
  STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS: '60',
});

function refuse() {
  const error = new Error('Original HTTP fixture quota declaration differs');
  error.code = 'HTTP_ORIGINAL_QUOTAS_INVALID';
  throw error;
}

/** Declaration-only projection. Parent must bind it to the actual build inputs. */
export function loadHttpOriginalQuotaRecipe(checkoutRoot) {
  if (arguments.length !== 1 || typeof checkoutRoot !== 'string') refuse();
  const path = 'reference/api/docker-compose.yml';
  const capture = readHttpQualificationDeclaration(checkoutRoot, resolve(checkoutRoot, path));
  let environment;
  try {
    const document = YAML.parseDocument(capture.bytes.toString('utf8'), { uniqueKeys: true });
    if (document.errors.length || document.warnings.length) refuse();
    environment = document.toJS({ maxAliasCount: 0 })?.services?.['reference-api']?.environment;
  } catch {
    refuse();
  }
  if (!environment || Array.isArray(environment) || typeof environment !== 'object') refuse();
  const selected = Object.keys(environment).filter((key) => key.startsWith('STYNX_SAMPLE_'));
  if (
    selected.length !== Object.keys(limits).length ||
    selected.some((key) => !Object.hasOwn(limits, key) || environment[key] !== limits[key])
  )
    refuse();
  return {
    source: { ...capture.row, path },
    environment: { ...limits },
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
