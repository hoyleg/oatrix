/** Loopback-only development HTTP adapter. Do not deploy this server publicly. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Gateway } from './gateway.mjs';
import { actionFieldsFor } from './world.mjs';
import { demand, fields, RuleError } from './canonical.mjs';
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/sweeps.html', ['sweeps.html', 'text/html; charset=utf-8']], ['/sweeps.mjs', ['sweeps.mjs', 'text/javascript; charset=utf-8']], ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
async function readJSON(req) {
  demand(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON_REQUIRED');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; demand(size <= 32_768, 'BODY_TOO_LARGE'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RuleError('BAD_JSON'); }
}
export async function startHost(journal, { port = 0, report = null, sweepReport = null } = {}) {
  let gateway, audience;
  const windows = new Map();
  const server = createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      demand(req.headers.host === new URL(audience).host, 'HOST_MISMATCH');
      demand(!req.headers.origin || req.headers.origin === audience, 'ORIGIN_REJECTED');
      const url = new URL(req.url, audience);
      if (req.method === 'GET') {
        if (url.pathname === '/api/protocol') {
          const state = journal.state;
          return json(200, { world: state.world, stateVersion: state.v, envelopeVersion: 1, envelopeVersions: [1, 2], actions: actionFieldsFor(state.v) });
        }
        if (url.pathname === '/api/state') return json(200, gateway.snapshot());
        if (url.pathname === '/api/health') return json(200, { mode: 'single-writer-loopback-lab', world: journal.state.world, head: journal.head });
        if (url.pathname === '/sweeps.json') return sweepReport === null ? json(404, { error: 'NO_SWEEP_REPORT' }) : json(200, sweepReport);
        if (url.pathname === '/report.json') return json(200, report ?? { experiments: [] });
        if (url.pathname === '/api/events') {
          const after = Number(url.searchParams.get('after') ?? '0');
          demand(Number.isSafeInteger(after) && after >= 0, 'BAD_CURSOR');
          const events = journal.events.slice(after, after + 100); return json(200, { events, next: after + events.length });
        }
        if (ASSETS.has(url.pathname)) {
          const [file, type] = ASSETS.get(url.pathname);
          const bytes = await readFile(new URL('../web/' + file, import.meta.url));
          res.writeHead(200, { 'Content-Type': type }); return res.end(bytes);
        }
        return json(404, { error: 'NOT_FOUND' });
      }
      demand(req.method === 'POST', 'METHOD_NOT_ALLOWED');
      // Bounded local mutation rate. Not a production distributed anti-abuse mechanism.
      const minute = Math.floor(Date.now() / 60_000), ip = req.socket.remoteAddress;
      for (const [key, value] of windows) if (value.minute !== minute) windows.delete(key);
      const window = windows.get(ip) ?? { minute, count: 0 }; window.count++; windows.set(ip, window);
      demand(window.count <= 120, 'RATE_LIMIT');
      const body = await readJSON(req);
      if (url.pathname === '/api/challenges') { fields(body, ['principal']); return json(200, gateway.challenge(body.principal)); }
      if (url.pathname === '/api/sessions') { fields(body, ['challenge', 'signature']); return json(200, gateway.login(body.challenge, body.signature)); }
      if (url.pathname === '/api/commands') {
        const auth = req.headers.authorization;
        if (auth) { demand(auth.startsWith('Bearer '), 'BAD_AUTH_HEADER'); return json(200, gateway.submit(auth.slice(7), body)); }
        return json(200, gateway.relay(body));
      }
      return json(404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error.code === 'BODY_TOO_LARGE' ? 413 : error.code === 'RATE_LIMIT' ? 429 : error instanceof RuleError ? 400 : 500;
      if (!res.headersSent) json(status, { error: error instanceof RuleError ? error.code : 'INTERNAL_ERROR' });
      else res.end();
    }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 5_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  audience = `http://127.0.0.1:${server.address().port}`; gateway = new Gateway(journal, audience);
  return { server, gateway, url: audience, close: async () => { gateway.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
