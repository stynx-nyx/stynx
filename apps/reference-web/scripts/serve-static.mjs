import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const distRoot = path.resolve(appRoot, 'dist/browser');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '3100');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function resolveFile(requestPath) {
  const cleanPath = requestPath.split('?')[0] || '/';
  const normalized = cleanPath === '/' ? '/index.html' : cleanPath;
  const absolutePath = path.resolve(distRoot, `.${normalized}`);
  if (!absolutePath.startsWith(distRoot)) {
    return path.resolve(distRoot, 'index.html');
  }
  if (existsSync(absolutePath)) {
    return absolutePath;
  }
  return path.resolve(distRoot, 'index.html');
}

const server = http.createServer(async (request, response) => {
  const filePath = resolveFile(request.url ?? '/');
  try {
    const fileStat = await stat(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Length', fileStat.size);
    response.setHeader('Content-Type', contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream');
    createReadStream(filePath).pipe(response);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`reference-web serving ${distRoot} on http://${host}:${port}`);
});
