import type { Locator, Page, Request } from '@playwright/test';

import { IonicApp } from './app.js';
import type { Driver, ElementFunction, PageFunction, Query, QueryOptions } from './driver.js';
import { nextFrame } from './page.js';
import { firePluginListeners, pluginMockScript, type PluginMock } from './plugin-mock.js';
import { escapeRegExp, type AriaRole, type Box, type Point, type Target } from './target.js';

/**
 * On iOS, Ionic's scroll assist clones a focused input (attributes and all)
 * while it scrolls the real one into view. The clone is never the target.
 */
const NOT_A_CLONE = ':not(.cloned-input)';

type Base = Page | Locator;

function locate(base: Base, target: Target): Locator {
	if (typeof target === 'string' || target instanceof RegExp) {
		return base.getByText(target, { exact: true });
	}
	if ('id' in target) {
		return base.getByTestId(target.id);
	}
	if ('label' in target) {
		const { label } = target;
		const named = (role: AriaRole) => base.getByRole(role, { name: label, exact: true });
		// ion-select's button is named "<label>, <value or placeholder>".
		const selectName = typeof label === 'string' ? new RegExp(`^${escapeRegExp(label)}(,|$)`) : label;
		return base
			.getByLabel(label, { exact: true })
			.or(named('checkbox'))
			.or(named('switch'))
			.or(named('radio'))
			.or(base.locator('ion-select').filter({ has: base.getByRole('button', { name: selectName }) }));
	}
	if ('role' in target) {
		return base.getByRole(target.role, { name: target.name, exact: true });
	}
	return base.locator(target.css);
}

class PlaywrightQuery implements Query {
	constructor(
		private readonly page: Page,
		readonly locator: Locator,
	) {}

	static of(page: Page, base: Base, target: Target, { visibleOnly = true }: QueryOptions = {}): PlaywrightQuery {
		const found = locate(base, target);
		const filtered = visibleOnly ? found.filter({ visible: true }) : found;
		return new PlaywrightQuery(page, filtered.and(page.locator(NOT_A_CLONE)));
	}

	first(): Query {
		return new PlaywrightQuery(this.page, this.locator.first());
	}

	last(): Query {
		return new PlaywrightQuery(this.page, this.locator.last());
	}

	query(target: Target, options?: QueryOptions): Query {
		return PlaywrightQuery.of(this.page, this.locator, target, options);
	}

	count(): Promise<number> {
		return this.locator.count();
	}

	async waitFor(state: 'visible' | 'hidden' | 'detached' = 'visible', timeout?: number): Promise<void> {
		await this.locator.waitFor({ state, timeout });
	}

	evaluate<A, R>(fn: ElementFunction<A, R>, arg: A): Promise<R> {
		// Playwright types the argument as Unboxed<A>; ours are plain data.
		return this.locator.evaluate(fn as ElementFunction<unknown, R>, arg);
	}

	async click({ viaScript = false }: { viaScript?: boolean } = {}): Promise<void> {
		if (viaScript) {
			await this.locator.evaluate((element) => (element as HTMLElement).click());
		} else {
			await this.locator.click();
		}
	}

	fill(text: string): Promise<void> {
		return this.locator.fill(text);
	}

	blur(): Promise<void> {
		return this.locator.blur();
	}

	async press(ms: number): Promise<void> {
		await this.locator.hover();
		await this.page.mouse.down();
		await this.page.waitForTimeout(ms);
		await this.page.mouse.up();
	}

	scrollIntoView(): Promise<void> {
		return this.locator.scrollIntoViewIfNeeded();
	}

	box(): Promise<Box | null> {
		return this.locator.boundingBox();
	}
}

/** Drives a Playwright page: Chromium or WebKit with device emulation. */
export class PlaywrightDriver implements Driver {
	readonly name = 'playwright';

	constructor(readonly page: Page) {}

	query(target: Target, options?: QueryOptions): PlaywrightQuery {
		return PlaywrightQuery.of(this.page, this.page, target, options);
	}

	evaluate<A, R>(fn: PageFunction<A, R>, arg: A): Promise<R> {
		return this.page.evaluate(fn as PageFunction<unknown, R>, arg);
	}

	async waitForFunction<A>(fn: PageFunction<A, boolean>, arg: A, options: { timeout: number; polling: number }): Promise<boolean> {
		try {
			await this.page.waitForFunction(fn as PageFunction<unknown, boolean>, arg, options);
			return true;
		} catch (error) {
			if (error instanceof Error && error.name === 'TimeoutError') return false;
			throw error;
		}
	}

	async goto(path: string): Promise<void> {
		await this.page.goto(path);
	}

	async goBack(): Promise<void> {
		await this.page.goBack();
	}

	async drag(from: Point, to: Point, steps: number, afterStep: () => Promise<boolean>): Promise<void> {
		const mouse = this.page.mouse;
		await mouse.move(from.x, from.y);
		await mouse.down();
		for (let step = 1; step <= steps; step++) {
			await mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
			if (await afterStep()) break;
		}
		await this.page.evaluate(nextFrame);
		await mouse.up();
	}

	sleep(ms: number): Promise<void> {
		return this.page.waitForTimeout(ms);
	}
}

/** A canned response for `mockApi`. */
export interface MockApiOptions {
	/** HTTP status. Defaults to 200. */
	status?: number;
	/** Only intercept this method (GET, POST, ...). Other methods fall through. */
	method?: string;
}

/**
 * `IonicApp` on a Playwright page, plus what only a browser you control can
 * do: mock the backend and Capacitor plugins.
 */
export class WebIonicApp extends IonicApp {
	readonly page: Page;

	constructor(page: Page) {
		super(new PlaywrightDriver(page));
		this.page = page;
	}

	/** The visible elements matching `target`, for assertions with `expect`. */
	find(target: Target): Locator {
		return (this.driver as PlaywrightDriver).query(target).locator;
	}

	/**
	 * Answer requests to `url` with `body` as JSON, or with what a function of
	 * the request returns. A `null` body sends an empty response (use with
	 * `status: 204`). Later mocks win over earlier ones, so register a catch-all
	 * first and specific routes after it.
	 */
	async mockApi(url: string | RegExp, body: (request: Request) => unknown, options?: MockApiOptions): Promise<void>;
	async mockApi(url: string | RegExp, body: unknown, options?: MockApiOptions): Promise<void>;
	async mockApi(url: string | RegExp, body: unknown, { status = 200, method }: MockApiOptions = {}): Promise<void> {
		await this.page.route(url, async (route) => {
			const request = route.request();
			if (method !== undefined && request.method() !== method.toUpperCase()) {
				await route.fallback();
				return;
			}

			const value = typeof body === 'function' ? await (body as (request: Request) => unknown)(request) : body;
			if (value === null || value === undefined) {
				await route.fulfill({ status, body: '' });
			} else {
				await route.fulfill({ status, json: value });
			}
		});
	}

	/**
	 * Replace Capacitor plugin `name` before the app loads. Call before
	 * `launch`. The app must read plugins through the `__capMocks` hook, e.g.
	 * `export const Camera = window.__capMocks?.Camera ?? RealCamera;`
	 */
	async mockPlugin(name: string, mock: PluginMock): Promise<void> {
		await this.page.addInitScript({ content: pluginMockScript(name, mock) });
	}

	/** Call the listeners the app registered on a mocked plugin. */
	async firePluginEvent(name: string, event: string, data?: unknown): Promise<void> {
		const fired = await this.page.evaluate(firePluginListeners, [name, event, data] as const);
		if (fired === 0) {
			throw new Error(`firePluginEvent: nothing is listening for ${name}.${event}`);
		}
	}
}

/** Wrap a Playwright page. */
export function ionicApp(page: Page): WebIonicApp {
	return new WebIonicApp(page);
}
