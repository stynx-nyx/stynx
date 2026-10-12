// Read-only, bounded GitHub API transport. Signed redirects never inherit credentials.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parseBaselineJson } from './k6-baseline-json.mjs';

const REPOSITORY = '/repos/stynx-nyx/stynx';
const WORKFLOW = 266480675;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_LOG_BYTES = 64 * 1024 * 1024;
const typedArrayLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'length',
).get;
const refuse = (message) => {
  throw new Error(`BASELINE_TRANSPORT_REFUSED: ${message}`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function id(value) {
  if (!Number.isSafeInteger(value) || value < 1) refuse('invalid endpoint identity');
  return String(value);
}
function page(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) refuse('pagination limit');
  return String(value);
}
function cancelBody(response) {
  try {
    response.body?.cancel().catch(() => {});
  } catch {
    // Refusal remains sticky if an already unavailable body cannot cancel.
  }
}
async function readBody(response, maximum, finish) {
  let reader;
  try {
    const encoding = response.headers.get('content-encoding');
    if (encoding !== null && encoding !== 'identity') refuse('unsupported response encoding');
    const declared = response.headers.get('content-length');
    if (
      declared !== null &&
      (!/^(?:0|[1-9][0-9]*)$/u.test(declared) ||
        !Number.isSafeInteger(Number(declared)) ||
        Number(declared) > maximum)
    )
      refuse('response size limit');
    if (!response.body) refuse('missing response body');
    // One fixed sink: chunk count cannot grow an unbounded array of allocations.
    const sink = Buffer.allocUnsafe(maximum);
    let size = 0;
    let chunks = 0;
    reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (types.isProxy(value) || !types.isUint8Array(value)) refuse('invalid response chunk');
      const length = typedArrayLength.call(value);
      chunks += 1;
      if (length < 1 || chunks > 65_536 || length > maximum - size)
        refuse('response size or chunk limit');
      Uint8Array.prototype.set.call(sink, value, size);
      size += length;
    }
    if (declared !== null && Number(declared) !== size) refuse('truncated response body');
    finish(false);
    return Buffer.from(sink.subarray(0, size));
  } catch {
    finish(true);
    if (reader) {
      try {
        reader.cancel().catch(() => {});
      } catch {
        // The request is already aborted and cannot supply accepted bytes.
      }
    } else cancelBody(response);
    refuse('invalid, incomplete or oversized response body');
  } finally {
    reader?.releaseLock();
  }
}

/** fetchImpl is an external transport test port, never an attestation authority. */
export function createGithubBaselineTransport(token, fetchImpl = globalThis.fetch) {
  if (
    typeof token !== 'string' ||
    token.length < 1 ||
    token.length > 4096 ||
    token.trim() !== token ||
    /[\r\n]/u.test(token) ||
    typeof fetchImpl !== 'function'
  )
    refuse('invalid transport configuration');
  const authenticatedHeaders = Object.freeze({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Accept-Encoding': 'identity',
  });
  const pending = new WeakMap();
  async function request(url, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    timer.unref();
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      pending.set(response, { controller, timer });
      return response;
    } catch {
      clearTimeout(timer);
      controller.abort();
      // Fetch errors may contain signed URLs or sensitive headers. Never expose their cause/message.
      refuse('HTTPS request failed');
    }
  }
  function finish(response, abort) {
    const state = pending.get(response);
    if (state) {
      clearTimeout(state.timer);
      if (abort) state.controller.abort();
      pending.delete(response);
    }
  }
  function reject(response, message) {
    finish(response, true);
    cancelBody(response);
    refuse(message);
  }
  async function jsonAt(endpoint) {
    const response = await request(endpoint, authenticatedHeaders);
    if (response.status !== 200) reject(response, `GitHub API status ${response.status}`);
    const contentType = response.headers.get('content-type');
    if (contentType === null || !/^application\/(?:vnd\.github\+)?json(?:;|$)/iu.test(contentType))
      reject(response, 'GitHub API response is not JSON');
    const bytes = await readBody(response, MAX_JSON_BYTES, (abort) => {
      if (abort) finish(response, true);
    });
    let value;
    try {
      value = parseBaselineJson(bytes);
    } catch {
      reject(response, 'GitHub API JSON is invalid or ambiguous');
    }
    finish(response, false);
    return Object.freeze({
      value,
      bytes,
      sha256: sha256(bytes),
      endpoint,
      status: response.status,
    });
  }
  const json = (path) => jsonAt(`https://api.github.com${REPOSITORY}/actions/${path}`);
  async function jobLog(jobId) {
    const endpoint = `https://api.github.com${REPOSITORY}/actions/jobs/${id(jobId)}/logs`;
    const response = await request(endpoint, authenticatedHeaders);
    if (response.status !== 302) reject(response, `GitHub job log status ${response.status}`);
    let signed;
    try {
      signed = new URL(response.headers.get('location'));
    } catch {
      reject(response, 'missing signed log redirect');
    }
    if (
      signed.protocol !== 'https:' ||
      signed.username ||
      signed.password ||
      signed.hash ||
      (signed.port && signed.port !== '443') ||
      !['.blob.core.windows.net', '.githubusercontent.com'].some((suffix) =>
        signed.hostname.endsWith(suffix),
      )
    )
      reject(response, 'unsafe signed log redirect');
    finish(response, true);
    cancelBody(response);
    // Signed delivery is a separate origin and never receives the API token.
    const delivered = await request(signed.href, { 'Accept-Encoding': 'identity' });
    if (delivered.status !== 200) reject(delivered, `Signed log status ${delivered.status}`);
    const bytes = await readBody(delivered, MAX_LOG_BYTES, (abort) => finish(delivered, abort));
    return Object.freeze({
      bytes,
      size: bytes.length,
      sha256: sha256(bytes),
      apiEndpoint: endpoint,
      signedHost: signed.hostname,
      originVerified: false,
    });
  }
  return Object.freeze({
    repository: () => jsonAt(`https://api.github.com${REPOSITORY}`),
    attemptJobs: (runId, attempt, number) =>
      json(`runs/${id(runId)}/attempts/${id(attempt)}/jobs?per_page=100&page=${page(number)}`),
    job: (jobId) => json(`jobs/${id(jobId)}`),
    jobLog,
    sourceWorkflow: (commit) => {
      if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/u.test(commit))
        refuse('invalid source commit');
      return jsonAt(
        `https://api.github.com${REPOSITORY}/contents/.github/workflows/hardening.yml?ref=${commit}`,
      );
    },
    workflow: () => json(`workflows/${WORKFLOW}`),
    run: (runId) => json(`runs/${id(runId)}`),
    attempt: (runId, attempt) => json(`runs/${id(runId)}/attempts/${id(attempt)}`),
    runs: (number) =>
      json(
        `workflows/${WORKFLOW}/runs?branch=main&exclude_pull_requests=true&per_page=100&page=${page(number)}`,
      ),
    artifacts: (runId, number) =>
      json(`runs/${id(runId)}/artifacts?per_page=100&page=${page(number)}`),
    artifact: (artifactId) => json(`artifacts/${id(artifactId)}`),
    download: async (artifactId) => {
      const endpoint = `https://api.github.com${REPOSITORY}/actions/artifacts/${id(artifactId)}/zip`;
      const response = await request(endpoint, authenticatedHeaders);
      if (response.status !== 302) reject(response, `GitHub archive status ${response.status}`);
      let signed;
      try {
        signed = new URL(response.headers.get('location'));
      } catch {
        reject(response, 'missing signed archive redirect');
      }
      if (
        signed.protocol !== 'https:' ||
        signed.username ||
        signed.password ||
        signed.hash ||
        (signed.port && signed.port !== '443') ||
        !['.blob.core.windows.net', '.githubusercontent.com'].some((suffix) =>
          signed.hostname.endsWith(suffix),
        )
      )
        reject(response, 'unsafe signed archive redirect');
      finish(response, true);
      cancelBody(response);
      const downloaded = await request(signed.href, {
        'Accept-Encoding': 'identity',
      });
      if (downloaded.status !== 200)
        reject(downloaded, `Signed archive status ${downloaded.status}`);
      const bytes = await readBody(downloaded, MAX_ARCHIVE_BYTES, (abort) =>
        finish(downloaded, abort),
      );
      return Object.freeze({
        bytes,
        sha256: sha256(bytes),
        size: bytes.length,
        apiEndpoint: endpoint,
        signedHost: signed.hostname,
        originVerified: false,
      });
    },
  });
}
