import { defineConfig } from '@playwright/test';

import type { IonicOptions } from './src/index';

/**
 * The harness through Appium, in a mobile browser: Chrome on Android, or
 * Safari on an iOS simulator. Needs an Appium server (`npx appium`) with the
 * platform's driver (UiAutomator2 / XCUITest) and one device or simulator.
 *
 *   APPIUM_PLATFORM  android (default) or ios
 *   APPIUM_URL       Appium server (default http://127.0.0.1:4723)
 *   HARNESS_HOST     How the device reaches this machine (default 10.0.2.2,
 *                    the Android emulator's alias for the host; 127.0.0.1 on
 *                    iOS, since simulators share the Mac's network). For a
 *                    USB Android phone, forward the ports with
 *                    `adb reverse tcp:4174 tcp:4174` (and 4175) and use 127.0.0.1
 *   UDID             The device to use, when more than one is connected
 *
 * Android:
 *   CHROMEDRIVER     A chromedriver matching the device's Chrome (Appium's
 *                    default lookup is used when unset)
 *   CHROMEDRIVER_DISABLE_BUILD_CHECK=1
 *                    Let a chromedriver of another major version try anyway
 *
 * iOS:
 *   IOS_DEVICE       Simulator name (default "iPhone 16")
 *   IOS_VERSION      Its iOS version. Set it when Xcode's SDK is newer than
 *                    your simulator runtimes: Appium otherwise assumes the SDK
 *                    version and finds no simulator (`xcrun simctl list runtimes`)
 */
const platform = process.env['APPIUM_PLATFORM'] === 'ios' ? 'ios' : 'android';
const appiumUrl = new URL(process.env['APPIUM_URL'] ?? 'http://127.0.0.1:4723');
const harnessHost = process.env['HARNESS_HOST'] ?? (platform === 'ios' ? '127.0.0.1' : '10.0.2.2');
const chromedriver = process.env['CHROMEDRIVER'];
const udid = process.env['UDID'];

/** The harness in each Ionic mode, each from its own server (Ionic 9). */
const modes = [
	{ mode: 'md', port: 4174 },
	{ mode: 'ios', port: 4175 },
] as const;

const capabilities =
	platform === 'ios'
		? {
				platformName: 'iOS',
				browserName: 'Safari',
				'appium:automationName': 'XCUITest',
				'appium:deviceName': process.env['IOS_DEVICE'] ?? 'iPhone 16',
				...(process.env['IOS_VERSION'] === undefined ? {} : { 'appium:platformVersion': process.env['IOS_VERSION'] }),
				...(udid === undefined ? {} : { 'appium:udid': udid }),
				// Building WebDriverAgent the first time can take minutes.
				'appium:wdaLaunchTimeout': 300_000,
				'appium:newCommandTimeout': 300,
			}
		: {
				platformName: 'Android',
				browserName: 'Chrome',
				'appium:automationName': 'UiAutomator2',
				...(udid === undefined ? {} : { 'appium:udid': udid }),
				...(chromedriver === undefined ? {} : { 'appium:chromedriverExecutable': chromedriver }),
				...(process.env['CHROMEDRIVER_DISABLE_BUILD_CHECK'] === '1' ? { 'appium:chromedriverDisableBuildCheck': true } : {}),
				'appium:newCommandTimeout': 300,
				'goog:chromeOptions': { args: ['--no-first-run', '--disable-fre'] },
			};

const deviceLabel = platform === 'ios' ? 'iOS · Safari' : 'Android · Chrome';

export default defineConfig<IonicOptions>({
	testDir: './harness',
	outputDir: `./test-results/appium-${platform}`,
	// One session per device, so one test at a time.
	workers: 1,
	retries: 0,
	timeout: 300_000,
	reporter: [['list'], ['html', { open: 'never', outputFolder: `playwright-report/appium-${platform}` }]],
	expect: { timeout: 15_000 },
	projects: modes.map(({ mode, port }) => ({
		name: `${deviceLabel} · ${mode} · Appium`,
		use: {
			ionicDriver: 'appium',
			appium: {
				remote: {
					hostname: appiumUrl.hostname,
					port: Number(appiumUrl.port),
					path: appiumUrl.pathname,
					logLevel: 'warn',
					// The first iOS session builds WebDriverAgent.
					connectionRetryTimeout: 600_000,
					capabilities,
				},
				baseURL: `http://${harnessHost}:${port}/`,
				actionTimeout: 15_000,
			},
		},
	})),
	webServer: modes.map(({ mode, port }) => ({
		command: 'node harness/serve.ts',
		env: { HARNESS_PORT: String(port), HARNESS_MODE: mode },
		url: `http://127.0.0.1:${port}/`,
		reuseExistingServer: true,
	})),
});
