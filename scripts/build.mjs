// Builds dist/esm and dist/cjs. The CJS folder gets its own package.json so
// Node and TypeScript read its .js and .d.ts files as CommonJS.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = (project) => execFileSync(process.execPath, [tsc, '-p', project], { stdio: 'inherit' });

rmSync('dist', { recursive: true, force: true });
run('tsconfig.build.json');
run('tsconfig.cjs.json');
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, '\t') + '\n');

// Load both builds, so a broken entry point (e.g. an extensionless ESM import)
// fails the build instead of a consumer's install.
const { pathToFileURL } = await import('node:url');
const esm = await import(pathToFileURL('dist/esm/index.js').href);
const { resolve } = await import('node:path');
const cjs = createRequire(import.meta.url)(resolve('dist/cjs/index.js'));
for (const [format, exports] of [['esm', esm], ['cjs', cjs]]) {
	if (typeof exports.ionicApp !== 'function' || typeof exports.ionicFixtures !== 'object') {
		throw new Error(`build: the ${format} entry point does not export ionicApp and ionicFixtures`);
	}
}
