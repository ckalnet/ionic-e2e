import type { Fixtures, PlaywrightTestArgs, PlaywrightWorkerArgs } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

import type { IonicApp } from './app.js';
import { AppiumDriver, DeviceIonicApp, connectAppium, deviceScreenshot, type AppiumOptions, type DeviceBrowser } from './appium.js';
import { WebIonicApp } from './playwright.js';

export type IonicDriverName = 'playwright' | 'appium';

/** Project-level options: set them in a project's `use`. */
export interface IonicOptions {
	/** Which driver runs the tests. Defaults to `'playwright'`. */
	ionicDriver: IonicDriverName;
	/** The Appium session, for `ionicDriver: 'appium'` projects. */
	appium: AppiumOptions | undefined;
}

export interface IonicFixtures {
	/** The primitives, on whichever driver the project uses. */
	app: IonicApp;
	/**
	 * The app on the Playwright driver, with mocking. A test that uses this is
	 * skipped on Appium projects.
	 */
	web: WebIonicApp;
	/**
	 * The app on the Appium driver, with the device session. A test that uses
	 * this is skipped on Playwright projects.
	 */
	device: DeviceIonicApp;
}

interface IonicWorkerFixtures {
	/** One Appium session per worker; null on Playwright projects. */
	appiumSession: DeviceBrowser | null;
}

/**
 * Fixtures for `test.extend`. Use them with your own `@playwright/test`:
 *
 * ```ts
 * import { test as base } from '@playwright/test';
 * import { ionicFixtures } from 'ionic-e2e';
 * export const test = base.extend(ionicFixtures);
 * ```
 *
 * Appium projects run one session per worker, so give them `workers: 1` per
 * device. Playwright still opens a browser page for them (fixtures can't be
 * requested lazily); it goes unused.
 */
export const ionicFixtures: Fixtures<IonicFixtures, IonicOptions & IonicWorkerFixtures, PlaywrightTestArgs, PlaywrightWorkerArgs> = {
	ionicDriver: ['playwright', { scope: 'worker', option: true }],
	appium: [undefined, { scope: 'worker', option: true }],

	appiumSession: [
		async ({ ionicDriver, appium }, use) => {
			if (ionicDriver !== 'appium') {
				await use(null);
				return;
			}
			if (appium === undefined) {
				throw new Error("ionic-e2e: a project with ionicDriver: 'appium' needs an `appium` option.");
			}
			const browser = await connectAppium(appium);
			try {
				await use(browser);
			} finally {
				await browser.deleteSession().catch(() => undefined);
			}
		},
		{ scope: 'worker' },
	],

	app: async ({ ionicDriver, appium, appiumSession, page }, use, testInfo) => {
		if (ionicDriver === 'appium' && appiumSession !== null) {
			await use(new DeviceIonicApp(new AppiumDriver(appiumSession, appium)));
			// Playwright's own failure screenshot shows the unused browser page,
			// so attach the device's screen and the WebView's HTML instead.
			if (testInfo.status !== testInfo.expectedStatus) {
				const screenshot = await deviceScreenshot(appiumSession).catch(() => null);
				if (screenshot !== null) {
					const path = testInfo.outputPath('device-screenshot.png');
					await writeFile(path, Buffer.from(screenshot, 'base64'));
					await testInfo.attach('device-screenshot', { path, contentType: 'image/png' });
				}
				const html = await appiumSession.getPageSource().catch(() => null);
				if (html !== null) {
					const path = testInfo.outputPath('webview.html');
					await writeFile(path, html);
					await testInfo.attach('webview-html', { path, contentType: 'text/html' });
				}
			}
		} else {
			await use(new WebIonicApp(page));
		}
	},

	web: async ({ app }, use, testInfo) => {
		testInfo.skip(!(app instanceof WebIonicApp), 'Needs the Playwright driver (mocks the backend or plugins).');
		await use(app as WebIonicApp);
	},

	device: async ({ app }, use, testInfo) => {
		testInfo.skip(!(app instanceof DeviceIonicApp), 'Needs the Appium driver (a real device).');
		await use(app as DeviceIonicApp);
	},
};
