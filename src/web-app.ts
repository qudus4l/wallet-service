import { existsSync } from 'node:fs';
import { type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type NextFunction, type Request, type Response } from 'express';

/** Built frontend (web/dist). Absent in API-only environments such as the test suite. */
export const WEB_DIST = join(__dirname, '..', 'web', 'dist');
const API_PREFIXES = ['/v1/', '/health/', '/docs'];

/**
 * Serves the React frontend from the same origin as the API (no CORS, one URL).
 * Static files are served as-is; any other browser navigation outside the API
 * gets index.html so client-side routes work on refresh.
 */
export function serveWebApp(app: NestExpressApplication): void {
  const index = join(WEB_DIST, 'index.html');
  if (!existsSync(index)) return;

  app.useStaticAssets(WEB_DIST, {
    index: false,
    // Vite fingerprints asset filenames, so they can be cached forever.
    setHeaders: (res: ServerResponse, path: string) => {
      if (path.includes(`${join('dist', 'assets')}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPageRequest = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
    if (!isPageRequest || API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
