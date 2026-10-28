import { test as base } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

import { ionicFixtures } from '../src/index';
import { fileFor, indexHtml, type IonicMode, type IonicVersion } from './files';

export { expect } from '@playwright/test';
export type { IonicMode, IonicVersion };

/**
 * The package's own fixtures, plus the harness page. On the Playwright driver
 * the harness is served from disk at http://harness.test/ by routing
 * requests; anything not on disk (e.g. /api/*) is a 404 unless a test mocks
 * it. Device projects load it from harness/serve.ts instead.
 */
export const test = base.extend(ionicFixtures).extend<{
	ionicMode: IonicMode;
	ionicVersion: IonicVersion;
	harness: void;
}>({
	ionicMode: ['md', { option: true }],
	ionicVersion: [9, { option: true }],

	harness: [
		async ({ ionicDriver, page, ionicMode, ionicVersion }, use) => {
			if (ionicDriver === 'playwright') {
				await page.context().route('http://harness.test/**', async (route) => {
					const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
					if (pathname === '/') {
						await route.fulfill({ contentType: 'text/html', body: indexHtml(ionicMode) });
						return;
					}
					const file = fileFor(pathname, ionicVersion);
					if (existsSync(file) && statSync(file).isFile()) {
						await route.fulfill({ path: file });
					} else {
						await route.fulfill({ status: 404, body: 'Not found' });
					}
				});
			}
			await use();
		},
		{ auto: true },
	],
});
