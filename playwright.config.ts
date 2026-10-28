import { defineConfig, devices } from '@playwright/test';

import type { IonicMode, IonicVersion } from './harness/files';

const isCI = !!process.env['CI'];

const phones = [
	{ name: 'Pixel 7', device: devices['Pixel 7'] },
	{ name: 'iPhone 14 Pro', device: devices['iPhone 14 Pro'] },
];
const modes: IonicMode[] = ['md', 'ios'];
const versions: IonicVersion[] = [9, 8];

/**
 * The primitives' self-test: every phone, Ionic mode and Ionic version.
 * Served from disk by harness/fixtures.ts; no web server.
 */
export default defineConfig({
	testDir: './harness',
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	// WebKit starves for frames with too many instances (seen at 16 workers
	// on Windows: actions stall in Playwright's stability check).
	workers: '25%',
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: 'http://harness.test/',
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
		screenshot: 'only-on-failure',
		actionTimeout: 10_000,
	},
	expect: { timeout: 10_000 },
	projects: phones.flatMap(({ name, device }) =>
		modes.flatMap((ionicMode) =>
			versions.map((ionicVersion) => ({
				name: `${name} · ${ionicMode} · Ionic ${ionicVersion}`,
				use: { ...device, ionicMode, ionicVersion },
			})),
		),
	),
});
