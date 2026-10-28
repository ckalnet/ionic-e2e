import { IonicApp } from './app.js';
import type { Driver, ElementFunction, PageFunction, Query, QueryOptions } from './driver.js';
import { resolveTarget } from './page.js';
import { describeTarget, serializeTarget, type Box, type Point, type Target } from './target.js';

/** A W3C WebDriver element reference, as a script returns it. */
type ElementReference = { 'element-6066-11e4-a52e-4f735466cecf': string };

/**
 * The slice of a WebdriverIO `Browser` this driver uses. Kept structural so
 * the published types don't depend on webdriverio, an optional peer. Cast
 * `device.browser` to `WebdriverIO.Browser` for the full API.
 */
export interface DeviceBrowser {
	readonly capabilities: { platformName?: string };
	readonly options: { connectionRetryTimeout?: number };
	execute(script: string, ...args: unknown[]): Promise<unknown>;
	executeAsyncScript<R>(script: string, args: unknown[]): Promise<R>;
	setTimeout(timeouts: { script?: number }): Promise<void>;
	$(selector: ElementReference | string): ChainableElement;
	url(url: string): Promise<unknown>;
	getUrl(): Promise<string>;
	back(): Promise<void>;
	getContexts(): Promise<unknown[]>;
	getContext(): Promise<unknown>;
	switchContext(context: string): Promise<void>;
	action(type: 'pointer', options: { id?: string; parameters: { pointerType: 'touch' | 'mouse' } }): PointerAction;
	deleteSession(): Promise<void>;
	takeScreenshot(): Promise<string>;
	getPageSource(): Promise<string>;
}

type ChainableElement = PromiseLike<{
	click(): Promise<void>;
	setValue(value: string): Promise<void>;
}>;

interface PointerAction {
	move(options: { x?: number; y?: number; origin?: 'viewport' | 'pointer'; duration?: number }): PointerAction;
	down(): PointerAction;
	up(): PointerAction;
	pause(ms: number): PointerAction;
	perform(skipRelease?: boolean): Promise<void>;
}

export interface AppiumOptions {
	/**
	 * Options for WebdriverIO's `remote()`: hostname, port, path and the
	 * Appium capabilities (platformName, appium:automationName, appium:app or
	 * browserName, ...).
	 */
	remote: { capabilities: Record<string, unknown>; [option: string]: unknown };
	/** What `launch()` paths resolve against. Defaults to the WebView's current origin. */
	baseURL?: string;
	/** Which context to drive. Defaults to the first WEBVIEW or CHROMIUM context. */
	webviewContext?: RegExp;
	/** How long actions wait for their target, in ms. Defaults to 10 seconds. */
	actionTimeout?: number;
	/**
	 * How long one WebDriver command may take once the session exists, in ms.
	 * Defaults to 2 minutes. `remote.connectionRetryTimeout` still applies to
	 * creating the session, which on iOS includes building WebDriverAgent;
	 * keeping that long for every command lets a stalled command hang a run.
	 */
	commandTimeout?: number;
}

// A real dynamic import, kept as one in the CommonJS build too (webdriverio is
// ESM-only; TypeScript would turn a plain import() into require()).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

/** Start an Appium session and switch to the app's WebView. */
export async function connectAppium(options: AppiumOptions): Promise<DeviceBrowser> {
	let webdriverio: { remote(options: unknown): Promise<DeviceBrowser> };
	try {
		webdriverio = (await importModule('webdriverio')) as typeof webdriverio;
	} catch (error) {
		throw new Error('ionic-e2e: the Appium driver needs webdriverio. Install it with `npm install --save-dev webdriverio`.', {
			cause: error,
		});
	}
	// WebdriverIO 9 prefers WebDriver BiDi, which Appium's WebView and mobile
	// browser contexts don't implement (navigation fails). Use classic
	// WebDriver unless the caller asked otherwise.
	const browser = await webdriverio.remote({
		...options.remote,
		capabilities: { 'wdio:enforceWebDriverClassic': true, ...options.remote.capabilities },
	});
	browser.options.connectionRetryTimeout = options.commandTimeout ?? 120_000;
	const wanted = options.webviewContext ?? /^(WEBVIEW|CHROMIUM)/;
	const deadline = Date.now() + 30_000;
	for (;;) {
		const contexts = (await browser.getContexts()).map((context) =>
			typeof context === 'string' ? context : String((context as { id: string }).id),
		);
		const webview = contexts.find((context) => wanted.test(context));
		if (webview !== undefined) {
			await browser.switchContext(webview);
			// Page functions run as async scripts (see AppiumDriver.run); Safari's
			// default script timeout is too short for them.
			await browser.setTimeout({ script: 30_000 });
			return browser;
		}
		if (Date.now() > deadline) {
			await browser.deleteSession();
			throw new Error(`ionic-e2e: no ${String(wanted)} context appeared. Contexts: ${contexts.join(', ')}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

class AppiumQuery implements Query {
	constructor(
		private readonly driver: AppiumDriver,
		private readonly target: Target,
		private readonly options: QueryOptions,
		private readonly scope: AppiumQuery | null = null,
		private readonly pick: 'all' | 'first' | 'last' = 'all',
	) {}

	first(): Query {
		return new AppiumQuery(this.driver, this.target, this.options, this.scope, 'first');
	}

	last(): Query {
		return new AppiumQuery(this.driver, this.target, this.options, this.scope, 'last');
	}

	query(target: Target, options: QueryOptions = {}): Query {
		return new AppiumQuery(this.driver, target, options, this);
	}

	async count(): Promise<number> {
		return (await this.resolve()).length;
	}

	async waitFor(state: 'visible' | 'hidden' | 'detached' = 'visible', timeout = this.driver.actionTimeout): Promise<void> {
		const present = state === 'visible';
		await this.driver.until(async () => (await this.count()) > 0 === present, `${this.describe()} to be ${state}`, timeout);
	}

	async evaluate<A, R>(fn: ElementFunction<A, R>, arg: A): Promise<R> {
		const element = await this.one();
		return this.driver.run<R>(fn, element, arg);
	}

	async click({ viaScript = false }: { viaScript?: boolean } = {}): Promise<void> {
		const element = await this.one();
		await this.driver.run(scrollIntoCenter, element);
		if (viaScript) {
			await this.driver.run(clickInPage, element);
		} else {
			await (await this.driver.browser.$(element)).click();
		}
	}

	async fill(text: string): Promise<void> {
		const element = await this.one();
		await (await this.driver.browser.$(element)).setValue(text);
	}

	async blur(): Promise<void> {
		await this.driver.run(blurInPage, await this.one());
	}

	async press(ms: number): Promise<void> {
		await this.scrollIntoView();
		const box = await this.box();
		if (box === null) throw new Error(`press: ${this.describe()} has no bounding box`);
		const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await this.driver.touch([at], (finger, [point]) =>
			finger.move({ ...point, origin: 'viewport', duration: 0 }).down().pause(ms).up(),
		);
	}

	async scrollIntoView(): Promise<void> {
		await this.driver.run(scrollIntoCenter, await this.one());
	}

	async box(): Promise<Box | null> {
		return this.driver.run<Box | null>(boxInPage, await this.one());
	}

	/** The single element this query matches, waiting for it to appear. Strict. */
	private async one(): Promise<ElementReference> {
		let found: ElementReference[] = [];
		await this.driver.until(
			async () => {
				found = await this.resolve();
				return found.length > 0;
			},
			`${this.describe()} to be visible`,
			this.driver.actionTimeout,
		);
		if (found.length > 1) {
			throw new Error(`strict mode violation: ${this.describe()} resolved to ${found.length} elements`);
		}
		return found[0];
	}

	private async resolve(): Promise<ElementReference[]> {
		const scope = this.scope === null ? null : await this.scope.one();
		const all = await this.driver.run<ElementReference[]>(
			resolveTarget,
			serializeTarget(this.target),
			scope,
			this.options.visibleOnly ?? true,
		);
		if (this.pick === 'first') return all.slice(0, 1);
		if (this.pick === 'last') return all.slice(-1);
		return all;
	}

	private describe(): string {
		const pick = this.pick === 'all' ? '' : `.${this.pick}()`;
		return `${this.scope === null ? '' : `${this.scope.describe()} > `}${describeTarget(this.target)}${pick}`;
	}
}

/** Drives an Ionic app's WebView on a device or emulator through Appium. */
export class AppiumDriver implements Driver {
	readonly name = 'appium';
	readonly actionTimeout: number;
	private readonly baseURL: string | undefined;

	constructor(
		readonly browser: DeviceBrowser,
		options: Pick<AppiumOptions, 'baseURL' | 'actionTimeout'> = {},
	) {
		this.baseURL = options.baseURL;
		this.actionTimeout = options.actionTimeout ?? 10_000;
	}

	query(target: Target, options: QueryOptions = {}): Query {
		return new AppiumQuery(this, target, options);
	}

	evaluate<A, R>(fn: PageFunction<A, R>, arg: A): Promise<R> {
		return this.run<R>(fn, arg);
	}

	/**
	 * Run a page function and wait for its result, even when it returns a
	 * promise. chromedriver awaits a promise from a plain `execute`; Safari's
	 * WebDriver returns it unresolved. An async script with an explicit
	 * callback behaves the same on both. This calls the protocol command
	 * directly: WebdriverIO 10 dropped its `executeAsync` wrapper.
	 */
	async run<R>(fn: (...args: never[]) => unknown, ...args: unknown[]): Promise<R> {
		const script = `var done = arguments[arguments.length - 1];
var args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
Promise.resolve()
	.then(function () { return (${fn.toString()}).apply(null, args); })
	.then(
		function (value) { done({ value: value === undefined ? null : value }); },
		function (error) { done({ error: String((error && error.message) || error) }); }
	);`;
		const result = await this.browser.executeAsyncScript<{ value?: R; error?: string }>(script, args);
		if (result.error !== undefined) {
			throw new Error(`Error in page: ${result.error}`);
		}
		return result.value as R;
	}

	async waitForFunction<A>(fn: PageFunction<A, boolean>, arg: A, { timeout, polling }: { timeout: number; polling: number }): Promise<boolean> {
		const deadline = Date.now() + timeout;
		for (;;) {
			if (await this.evaluate(fn, arg)) return true;
			if (Date.now() > deadline) return false;
			await this.sleep(polling);
		}
	}

	async goto(path: string): Promise<void> {
		const base = this.baseURL ?? (await this.browser.getUrl());
		await this.browser.url(new URL(path, base).toString());
	}

	async goBack(): Promise<void> {
		await this.browser.back();
	}

	/**
	 * One W3C action sequence: chromedriver doesn't keep a touch pressed
	 * across separate sequences, so the press, moves and release go together,
	 * each move lasting about two frames. That means `afterStep` can't release
	 * early here; the drag always runs to the end.
	 */
	async drag(from: Point, to: Point, steps: number): Promise<void> {
		const points = [from];
		for (let step = 1; step <= steps; step++) {
			points.push({ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
		}
		await this.touch(points, (finger, [start, ...moves]) => {
			let gesture = finger.move({ ...start, origin: 'viewport', duration: 0 }).down();
			for (const point of moves) gesture = gesture.move({ ...point, origin: 'viewport', duration: 32 });
			return gesture.pause(50).up();
		});
	}

	/**
	 * Perform a touch gesture through the points given in CSS pixels of the
	 * page. Android's chromedriver takes those as they are. On iOS, XCUITest
	 * runs touch actions in screen points even from a web context, and the
	 * page starts below the status bar and any browser chrome. XCUITest's own
	 * calibration measures that offset (with two taps onto a temporary
	 * overlay, so the page sees nothing), then the gesture runs in NATIVE_APP.
	 */
	async touch(points: Point[], build: (finger: PointerAction, points: Point[]) => PointerAction): Promise<void> {
		const round = (point: Point) => ({ x: Math.round(point.x), y: Math.round(point.y) });
		if (String(this.browser.capabilities.platformName).toLowerCase() !== 'ios') {
			await build(this.finger(), points.map(round)).perform();
			return;
		}
		const calibration = (await this.browser.execute('mobile: calibrateWebToRealCoordinatesTranslation', {})) as WebCalibration;
		// XCUITest applies the pixel ratio only to a page wider or taller than the
		// window (one without a device-width viewport); do the same.
		const window = await this.evaluate(windowSize, undefined);
		const scaled = window.innerWidth > window.outerWidth || window.innerHeight > window.outerHeight;
		const onScreen = points.map((point) =>
			round({
				x: calibration.offsetX + point.x * (scaled ? calibration.pixelRatioX : 1),
				y: calibration.offsetY + point.y * (scaled ? calibration.pixelRatioY : 1),
			}),
		);
		const context = await this.browser.getContext();
		const webContext = typeof context === 'string' ? context : String((context as { id: string }).id);
		await this.browser.switchContext('NATIVE_APP');
		try {
			await build(this.finger(), onScreen).perform();
		} finally {
			await this.browser.switchContext(webContext);
		}
	}

	sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/** A touch pointer; the same id across calls keeps it pressed between them. */
	finger(): PointerAction {
		return this.browser.action('pointer', { id: 'finger', parameters: { pointerType: 'touch' } });
	}

	async until(condition: () => Promise<boolean>, what: string, timeout: number): Promise<void> {
		const deadline = Date.now() + timeout;
		while (!(await condition())) {
			if (Date.now() > deadline) {
				throw new Error(`Timed out after ${timeout}ms waiting for ${what}`);
			}
			await this.sleep(100);
		}
	}
}

/**
 * The whole screen as a base64 PNG. A WebView-context screenshot shows only
 * the web layer, missing native views (camera previews, system dialogs, the
 * keyboard), so this switches to NATIVE_APP for the shot and back after.
 */
export async function deviceScreenshot(browser: DeviceBrowser): Promise<string> {
	const current = await browser.getContext();
	const name = typeof current === 'string' ? current : String((current as { id: string }).id);
	if (name === 'NATIVE_APP') return browser.takeScreenshot();
	await browser.switchContext('NATIVE_APP');
	try {
		return await browser.takeScreenshot();
	} finally {
		await browser.switchContext(name);
	}
}

/** `IonicApp` on a real device or emulator, through Appium. */
export class DeviceIonicApp extends IonicApp {
	readonly browser: DeviceBrowser;

	constructor(driver: AppiumDriver) {
		super(driver);
		this.browser = driver.browser;
	}
}

interface WebCalibration {
	offsetX: number;
	offsetY: number;
	pixelRatioX: number;
	pixelRatioY: number;
}

function windowSize(): { innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number } {
	return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight };
}

function scrollIntoCenter(element: Element): void {
	element.scrollIntoView({ block: 'center', inline: 'center' });
}

function clickInPage(element: Element): void {
	(element as HTMLElement).click();
}

function blurInPage(element: Element): void {
	(element as HTMLElement).blur();
}

function boxInPage(element: Element): Box | null {
	const rect = element.getBoundingClientRect();
	return rect.width === 0 && rect.height === 0 ? null : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
