// Serves the harness over HTTP for device runs (an emulator can't use
// Playwright's request routing). Run with Node's type stripping:
//   node harness/serve.ts   (HARNESS_PORT, HARNESS_MODE, HARNESS_IONIC)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { fileFor, indexHtml, type IonicMode, type IonicVersion } from './files.ts';

const port = Number(process.env['HARNESS_PORT'] ?? 4174);
const mode = (process.env['HARNESS_MODE'] ?? 'md') as IonicMode;
const version = Number(process.env['HARNESS_IONIC'] ?? 9) as IonicVersion;

const types: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.json': 'application/json',
};

const server = createServer((request, response) => {
	const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://harness').pathname);
	if (pathname === '/') {
		response.writeHead(200, { 'Content-Type': types['.html'] });
		response.end(indexHtml(mode));
		return;
	}
	const file = fileFor(pathname, version);
	if (!existsSync(file) || !statSync(file).isFile()) {
		response.writeHead(404).end('Not found');
		return;
	}
	response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
	createReadStream(file).pipe(response);
});

// Node closes idle keep-alive connections after 5s. Safari can reuse one just
// as it closes and then shows "the network connection was lost" instead of
// retrying; between tests there is often about that much idle time.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(port, '0.0.0.0', () => {
	console.log(`Harness (${mode}, Ionic ${version}) on http://localhost:${port}/`);
});
