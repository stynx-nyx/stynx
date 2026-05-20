import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.OIDC_PORT ?? '3200');
const issuer = `http://${host}:${port}`;
const defaultTenantId = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
const codes = new Map();

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createAccessToken({ email, tenantId }) {
  const now = Math.floor(Date.now() / 1000);
  return [
    encodeJwtPart({ alg: 'none', typ: 'JWT' }),
    encodeJwtPart({
      iss: issuer,
      aud: 'reference-web-dev',
      sub: `fake-oidc:${email}`,
      email,
      tenant_id: tenantId,
      permissions: [
        'flow:read:analytics',
        'flow:read:design',
        'flow:read:runtime',
        'iam:groups:read',
        'iam:roles:read',
        'iam:users:read',
        'platform:audit:read:*',
        'sample:document:write',
        'sample:record:delete',
        'sample:record:read',
        'sample:record:restore',
        'sample:record:write',
        'sample:work-item:delete',
        'sample:work-item:read',
        'sample:work-item:restore',
        'sample:work-item:write',
      ],
      iat: now,
      exp: now + 3600,
    }),
    'signature',
  ].join('.');
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  if (request.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', issuer);
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (url.pathname === '/readyz') {
    sendJson(response, 200, { ok: true, issuer });
    return;
  }

  if (url.pathname === '/.well-known/openid-configuration') {
    sendJson(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['none'],
    });
    return;
  }

  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    if (!redirectUri) {
      sendJson(response, 400, { error: 'missing redirect_uri' });
      return;
    }

    const code = randomUUID();
    const email = url.searchParams.get('login_hint') || 'admin@sample-demo.test';
    const tenantId = url.searchParams.get('tenant_id') || defaultTenantId;
    codes.set(code, { email, tenantId });
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    const state = url.searchParams.get('state');
    if (state) {
      redirect.searchParams.set('state', state);
    }
    redirect.searchParams.set('tenantId', tenantId);
    response.writeHead(302, { location: redirect.toString() });
    response.end();
    return;
  }

  if (url.pathname === '/token' && request.method === 'POST') {
    const body = await readJson(request);
    const code = typeof body.code === 'string' ? body.code : '';
    const login = codes.get(code);
    if (!login) {
      sendJson(response, 400, { error: 'invalid_grant' });
      return;
    }
    codes.delete(code);
    const accessToken = createAccessToken(login);
    sendJson(response, 200, {
      access_token: accessToken,
      id_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid profile email',
    });
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  console.log(`reference-web fake OIDC ready at ${issuer}`);
});
