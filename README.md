# ionic-e2e

Test primitives for [Ionic](https://ionicframework.com) and
[Capacitor](https://capacitorjs.com) apps. Write a test once, then run it two
ways:

- **Fast and mocked**, in [Playwright](https://playwright.dev) (Chromium and
  WebKit with device emulation), with the backend and Capacitor plugins
  stubbed.
- **For real**, on devices and emulators through
  [Appium](https://appium.io), driving your installed app's WebView.

```ts
// tests/fixtures.ts
import { test as base } from '@playwright/test';
import { ionicFixtures } from 'ionic-e2e';

export const test = base.extend(ionicFixtures);
```

```ts
// tests/sign-in.spec.ts
import { test } from './fixtures';

test('signs in', async ({ app }) => {
	await app.launch('/');
	await app.type({ label: 'Email' }, 'ada@example.com');
	await app.type({ label: 'Password' }, 'hunter2');
	await app.tap('Sign in');
	await app.see({ role: 'tab', name: 'Home' });
});

test('shows an error when the server is down', async ({ web }) => {
	await web.mockApi('**/api/login', null, { status: 503 }); // web-only: skipped on devices
	await web.launch('/');
	await web.tap('Sign in');
	await web.see('Something went wrong');
});
```

Tests stay plain TypeScript, with no DSL. Each primitive handles an Ionic
quirk that trips up raw automation:

- Ionic keeps the pages it has navigated away from in the DOM, so every lookup
  is filtered to visible elements.
- `ionChange` fires on blur, so `type` fills and then blurs.
- Actions wait for page transitions and overlays to finish first.
- `select` waits for the overlay to leave the DOM before returning.
- Gestures (swipe, pull to refresh) are driven one animation frame at a time,
  so Ionic's gesture code sees every move.

## Install

```bash
npm install --save-dev ionic-e2e @playwright/test
npm install --save-dev webdriverio   # only for the Appium driver
```

Needs `@playwright/test` 1.51 or later and Node 20 or later; the Appium
driver needs WebdriverIO 10, which needs Node 22.19 or later. Ships ESM and
CommonJS builds, and uses your project's own Playwright (and WebdriverIO).

## Fixtures

| Fixture | What it is | Runs on |
| --- | --- | --- |
| `app` | The primitives | Every project |
| `web` | `app` plus mocking: `mockApi`, `mockPlugin`, `firePluginEvent`, `find`, `page` | Playwright projects; skipped on Appium projects |
| `device` | `app` plus the raw WebdriverIO session (`browser`) | Appium projects; skipped on Playwright projects |

So one spec file can hold shared journeys, web-only tests and device-only
tests. Each project runs what applies to it.

Without the test runner, `ionicApp(page)` wraps a Playwright page directly.

## Drivers

A project's `use` picks the driver:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import type { IonicOptions } from 'ionic-e2e';

export default defineConfig<IonicOptions>({
	projects: [
		// Fast and mocked: the default driver.
		{ name: 'Pixel 7', use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4200' } },

		// A real Android device, through Appium.
		{
			name: 'Android device',
			use: {
				ionicDriver: 'appium',
				appium: {
					remote: {
						hostname: '127.0.0.1',
						port: 4723,
						capabilities: {
							platformName: 'Android',
							'appium:automationName': 'UiAutomator2',
							'appium:app': './android/app/build/outputs/apk/debug/app-debug.apk',
						},
					},
					baseURL: 'https://localhost/', // Capacitor's Android origin
				},
			},
		},
	],
});
```

|  | Playwright driver | Appium driver |
| --- | --- | --- |
| Runs against | Your web build in Chromium / WebKit | Your installed app (or a mobile browser) on a device or emulator |
| Taps and typing | Playwright actions | WebDriver clicks and real key input in the WebView |
| Gestures | Mouse, one frame per step | W3C touch actions, one frame per step |
| Backend | `web.mockApi` | Your real backend |
| Capacitor plugins | `web.mockPlugin` | The real plugins |

Appium projects need a running Appium server with the platform's driver
(UiAutomator2 for Android, XCUITest for iOS). They open one session per
worker, so run them with one worker per device. The app's WebView must allow
debugging: Capacitor's Android debug builds do; on iOS, set
`ios.webContentsDebuggingEnabled: true` in `capacitor.config`. Playwright still opens an
unused browser page for Appium tests, because fixtures can't be requested
lazily.

## Primitives

| Primitive | Does |
| --- | --- |
| `launch(path = '/')` | Navigate and wait for `ion-app`. |
| `tap(target, { viaScript })` | Tap. Text inside a label that ignores pointer events (segment and tab buttons) taps the button that takes the tap. `viaScript: true` clicks with `element.click()` instead, an escape hatch for a WebView that refuses a real tap. |
| `longPress(target, ms = 1000)` | Press and hold. |
| `type(target, text)` | Replace the field's value, then blur it so `ionChange` fires. Works on `ion-input`, `ion-textarea`, `ion-searchbar` or a native field. |
| `check(target, on = true)` | Set an `ion-toggle` or `ion-checkbox`. Does nothing if it is already in that state. |
| `select(target, option)` | Pick an option from an `ion-select` (alert, popover, action-sheet or modal interface). |
| `swipe(target, direction)` | Drag `'left'`, `'right'`, `'up'` or `'down'` across an element, e.g. to open `ion-item-sliding` options. |
| `scrollTo(target)` | Scroll the visible `ion-content` until the target exists, including rows `ion-infinite-scroll` adds. |
| `pullToRefresh()` | Pull the visible `ion-refresher` and wait for the app to call `complete()`. |
| `back()` | Tap the visible `ion-back-button`, or go back in history. |
| `see(target)` / `notSee(target)` | Wait until the target is visible / until nothing matching it is visible. |
| `web.find(target)` | The visible-filtered Playwright locator, for `expect` assertions. |
| `web.mockApi(url, body, { status, method })` | Answer matching requests with JSON. |
| `web.mockPlugin(name, mock)` | Replace a Capacitor plugin before the app loads. |
| `web.firePluginEvent(name, event, data)` | Call the listeners the app added on a mocked plugin. |

## Targets

| Target | Matches |
| --- | --- |
| `'Save'` | Visible text, exact and case-sensitive. Use a RegExp (`/Save/`) for partial text. |
| `{ id: 'save-button' }` | `data-testid` |
| `{ label: 'Email' }` | An accessible label: `<label>`, `aria-label`, Ionic's `label` property, or the text of a toggle, checkbox or radio |
| `{ role: 'button', name: 'Save' }` | An ARIA role, with an optional exact name |
| `{ css: '.card' }` | A CSS selector |

If more than one visible element matches, the action fails as ambiguous
rather than picking one. Make the target more specific. Reach for text first,
then role or label, and use a `data-testid` where those would be brittle
(icon-only buttons, or copy that changes or repeats).

The Playwright driver resolves targets with Playwright's locators. The Appium
driver resolves them in the page with the same rules (visible only, exact
text, accessible names, open shadow roots). The harness runs on both drivers
to keep the two in step.

## Mocking the backend (Playwright)

```ts
await web.mockApi('**/api/**', {});                                   // catch-all: register first
await web.mockApi('**/api/users/42', { id: 42, name: 'Ada' });        // later mocks win
await web.mockApi('**/api/orders', null, { status: 204 });            // empty body
await web.mockApi('**/api/orders', created, { method: 'POST' });      // other methods fall through
await web.mockApi('**/api/login', (request) => {                      // build the body from the request
	sent = request.postDataJSON();
	return { token: 'test-token' };
});
```

`mockApi` wraps `page.route`. To keep a test off real servers entirely, abort
everything you haven't mocked:

```ts
await web.page.route((url) => url.hostname !== 'localhost', (route) => route.abort());
```

## Mocking Capacitor plugins (Playwright)

On the web, many Capacitor plugins have no implementation, or one that throws.
`mockPlugin` replaces a plugin for one test, but only if the app reads its
plugins through a small hook. Add the hook once, in a module that re-exports
the plugins your app uses:

```ts
// src/native/plugins.ts
import { Camera as CameraPlugin } from '@capacitor/camera';
import { Haptics as HapticsPlugin } from '@capacitor/haptics';

/** Lets E2E tests swap a plugin via window.__capMocks. Off in production. */
function mockable<T>(name: string, plugin: T): T {
	if (import.meta.env.PROD) return plugin; // or your framework's production flag
	return ((window as { __capMocks?: Record<string, unknown> }).__capMocks?.[name] as T | undefined) ?? plugin;
}

export const Camera = mockable('Camera', CameraPlugin);
export const Haptics = mockable('Haptics', HapticsPlugin);
```

Import plugin objects from that module instead of from their packages. Types
and enums can still come from the packages. With a constant production flag,
the bundler drops the hook from production builds. On devices the hook does
nothing, and the app uses the real plugins.

In a test, call `mockPlugin` before `launch`:

```ts
await web.mockPlugin('Camera', {
	getPhoto: { webPath: 'mock://photo.jpg' },              // a value: the method resolves to it
	checkPermissions() { return { camera: 'granted' }; },   // a function: runs in the browser
});
await web.launch('/');

await web.firePluginEvent('Network', 'networkStatusChange', { connected: false });
```

- A mock replaces the whole plugin. Methods you leave out resolve to `undefined`.
- Functions are sent to the browser as source, so they can't use variables
  from your test file. To see what the app sent, check the UI or a `mockApi`
  handler.
- `addListener` and `removeAllListeners` are built in, for `firePluginEvent`.

## Status and compatibility

**Playwright driver:** every primitive is self-tested on every combination of
Ionic 8 and 9, `md` and `ios` modes, and Chromium (as a Pixel 7) and WebKit
(as an iPhone 14 Pro). Works with any framework (Angular, React, Vue or plain
web components), because it works on the DOM.

**Appium driver: early.** Every shared primitive passes the harness through
Appium in both `md` and `ios` modes:

- Chrome on an Android 15 emulator (UiAutomator2).
- Chrome on a physical Android 12 phone, over USB.
- Safari on an iOS 18.6 iPhone simulator (XCUITest), and on a physical
  iPhone, iOS 18.5. There, Ionic's `ios` mode uses its native refresher,
  which follows Safari's rubber-band overscroll, and `pullToRefresh` drives
  it with real touches.

It has also driven an installed Capacitor app's WebView on the Android
emulator, including a live native camera preview. It has not yet run against
an installed app on iOS.

On Appium:

- WebdriverIO talks classic WebDriver (`wdio:enforceWebDriverClassic`), since
  Appium's WebView and mobile-browser contexts don't support WebDriver BiDi.
  Set the capability to `false` to override.
- A drag is sent as one touch sequence (chromedriver releases a touch between
  sequences), so a gesture always runs to its end.
- On iOS, XCUITest performs touch actions in screen points, and the page sits
  below the status bar and browser chrome. Gestures use XCUITest's own
  web-to-screen calibration, which taps a temporary overlay so the page sees
  nothing, and run in the `NATIVE_APP` context.
- Page code runs as async scripts, because Safari's WebDriver doesn't wait
  for a promise returned from a plain script (chromedriver does).
- Once the session exists, each WebDriver command is capped at 2 minutes
  (`commandTimeout`). `remote.connectionRetryTimeout` still governs creating
  the session, which on iOS includes building WebDriverAgent.
- Creating an iOS session takes about a minute, and Playwright replaces a
  worker (and so its session) after a failed test. So a run with failures on
  iOS is much slower than a clean one.
- A failed test saves `device-screenshot.png` and `webview.html` in its
  results folder. The screenshot is taken in the `NATIVE_APP` context, so it
  includes native layers a WebView screenshot misses: camera previews,
  system dialogs, the keyboard. `deviceScreenshot(device.browser)` takes the
  same shot on demand. Playwright's own failure screenshot shows the unused
  browser page.
- chromedriver must match the device's Chrome or WebView major version.
  `appium:chromedriverExecutable` points at a specific one;
  `appium:chromedriverDisableBuildCheck` lets a mismatched one try.

Known limits:

- On the Playwright driver, `pullToRefresh` drives Ionic's standard pull
  gesture. Playwright's WebKit has no rubber-band scrolling, so Ionic's native
  iOS refresher only comes into play on a real iOS browser, through the
  Appium driver.
- On the Playwright driver, `longPress` sends pointer and mouse events, not
  touch events. A long-press handler that only listens for `touchstart` won't
  fire.
- No primitives yet for `ion-datetime` or pickers. Use `web.page` or
  `device.browser`.
- Many WebKit instances in parallel can starve WebKit of frames. On Windows,
  16 workers made actions stall; 25% of cores was reliable.

## Development

```bash
npm install
npx playwright install chromium webkit
npm test              # harness, Playwright driver: every primitive × device × Ionic mode × version
npm run test:appium   # harness, Appium driver, Chrome on an Android emulator
npm run check         # typecheck, lint, build (the build also loads both outputs)
```

The Appium runs need an Appium server (`npx appium`; Appium and its
UiAutomator2 and XCUITest drivers are dev dependencies) and a device.
UiAutomator2 needs `ANDROID_HOME` set to the Android SDK. See `playwright.appium.config.ts`
for its settings. On a Mac, the same harness runs in Safari on an iOS
simulator:

```bash
APPIUM_PLATFORM=ios IOS_VERSION=18.6 npm run test:appium
```

Set `IOS_VERSION` to an installed simulator runtime (`xcrun simctl list
runtimes`). The first iOS session builds WebDriverAgent, which takes a few
minutes. A simulator's first boot after an Xcode update can take longer than
Appium waits; boot it once beforehand (`xcrun simctl boot …`) if that happens.

On a physical Android phone over USB, forward the harness ports to the phone
and point chromedriver at a build matching the phone's Chrome (from
[Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)):

```bash
adb reverse tcp:4174 tcp:4174 && adb reverse tcp:4175 tcp:4175
HARNESS_HOST=127.0.0.1 CHROMEDRIVER=/path/to/chromedriver npm run test:appium
```

Lockfile changes should come from npm 11.19 or later. Older npm (like 11.0)
writes a lockfile without other platforms' optional packages, and `npm ci` on
macOS or Linux then refuses it.

`harness/` is a standalone Ionic page, with one of every component the
primitives touch. Playwright serves it from disk; device runs use
`harness/serve.ts`. `harness/harness.spec.ts` is the source of truth for how
each primitive behaves: change it whenever a primitive changes, and add a case
there for any bug you fix.

## License

[MIT](LICENSE)
