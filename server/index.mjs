import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWorkspaceApi } from './workspace.mjs';

const root = process.env.COMPANYGEN_STATIC_ROOT
  ? path.resolve(process.env.COMPANYGEN_STATIC_ROOT)
  : fileURLToPath(new URL('../dist/', import.meta.url));
const api = createWorkspaceApi();
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  void api.handler(req, res, async () => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(path.resolve(root) + path.sep) && file !== path.resolve(root)) {
      res.writeHead(404).end(); return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      await stat(file);
    } catch {
      if (path.extname(pathname)) { res.writeHead(404).end(); return; }
      file = path.join(root, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Referrer-Policy': 'same-origin',
      'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }).catch(() => { if (!res.headersSent) res.writeHead(503).end(); else res.destroy(); });
});

server.listen(Number(process.env.PORT || 5174), process.env.HOST || '127.0.0.1', () => {
  console.log('CompanyGen pronto na porta ' + server.address().port);
});

function shutdown() {
  api.close();
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
