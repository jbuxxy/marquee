const http = require('http');
const { parse } = require('url');
const { Router } = require('./router');
const { serveStatic } = require('./static');
const { handleHealth } = require('./routes/health');
const registerRoutes = require('./routes/register');
const { resolveAdminPasswordHash } = require('./auth/bootstrap');
const { loadSessionsFromRedis } = require('./auth/visitorSession');
const { startPush } = require('./lib/push');
const logger = require('./lib/logger');

const PORT = parseInt(process.env.PORT, 10) || 8080;

async function main() {
  // Resolves (and, on a brand new instance, generates + logs) the admin
  // password before accepting any traffic, so it's visible in `docker logs`
  // immediately rather than only after someone tries to log in.
  await resolveAdminPasswordHash();
  // A no-op if services.redis.url isn't set. Awaited so a restored session
  // is available for the very first request, not just eventually.
  await loadSessionsFromRedis();

  const router = new Router();
  router.get('/healthz', handleHealth);
  registerRoutes(router);

  const server = http.createServer((req, res) => {
    try {
      const { pathname } = parse(req.url);
      const match = router.match(req.method, pathname);

      if (match) {
        Promise.resolve(match.handler(req, res, match.params)).catch((err) => {
          logger.error('request handler error:', err);
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
          if (!res.writableEnded) res.end(JSON.stringify({ error: 'internal error' }));
        });
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, pathname);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    } catch (err) {
      logger.error('unhandled server error:', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'internal error' }));
    }
  });

  server.listen(PORT, () => {
    logger.log(`listening on :${PORT}`);
    // Kick off the push connections once the server itself is listening —
    // getOrCreatePlexWebhookSecret() also needs to resolve before anyone
    // could load /admin and expect a real webhook URL to be there.
    startPush().catch((err) => logger.error('startPush failed:', err));
  });
}

main().catch((err) => {
  logger.error('fatal startup error:', err);
  process.exit(1);
});
