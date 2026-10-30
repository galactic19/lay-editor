import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

/** Dev-server only: stores uploads in memory so the demo and E2E tests can upload images. */
export function demoUploadPlugin(): Plugin {
  const files = new Map<string, { type: string; body: Buffer }>();
  let counter = 0;
  const read = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  return {
    name: 'laymaker-demo-upload',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.method === 'POST' && url.pathname === '/__upload') {
          if (url.searchParams.has('fail')) {
            res.statusCode = 500;
            res.end();
            return;
          }
          const id = String(++counter);
          files.set(id, { type: String(req.headers['content-type'] ?? 'application/octet-stream'), body: await read(req) });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ url: `/__uploads/${id}` }));
          return;
        }
        const stored = req.method === 'GET' && url.pathname.startsWith('/__uploads/') ? files.get(url.pathname.split('/').pop()!) : undefined;
        if (!stored) return next();
        res.setHeader('content-type', stored.type);
        res.end(stored.body);
      });
    },
  };
}
