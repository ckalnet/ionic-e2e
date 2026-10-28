import type { Driver, Query } from './driver.js';
import {
	hasRefreshed,
	isChecked,
	isIonicReady,
	isRefreshFinished,
	isSettled,
	markNativeField,
	markTappable,
	nextFrame,
	prepareRefresher,
	refresherPullDistance,
	scrollContentBy,
	scrollContentToTop,
	tagName,
	unmark,
} from './page.js';
import { describeTarget, type SwipeDirection, type Target } from './target.js';

/** Ionic overlays that `ion-select` opens, by interface. */
const SELECT_OVERLAYS = '.select-alert, .select-popover, .select-action-sheet, .select-modal';

/**
 * Animations that run longer than this are treated as decoration (progress
 * bars, timers), not as a transition worth waiting for.
 */
const SETTLE_IGNORE_LONGER_THAN_MS = 2000;
const SETTLE_TIMEOUT_MS = 3000;
/** How long the screen has to stay still to count as settled. */
const SETTLE_QUIET_MS = 100;

export interface TapOptions {
	/**
	 * Click with `element.click()` in the page instead of a real tap. An escape
	 * hatch for a WebView that refuses a real tap; it skips what a finger would
	 * go through, so use it sparingly.
	 */
	viaScript?: boolean;
}

/**
 * Test primitives for an Ionic app, on any `Driver`: Playwright for
 * fast mocked runs, Appium for real devices.
 */
export class IonicApp {
	private marks = 0;
	private settles = 0;

	constructor(protected readonly driver: Driver) {}

	/** Open `path` and wait for Ionic to boot. */
	async launch(path = '/'): Promise<void> {
		await this.driver.goto(path);
		const ready = await this.driver.waitForFunction(isIonicReady, undefined, { timeout: 30_000, polling: 100 });
		if (!ready) {
			throw new Error(`launch: Ionic did not start at ${path}`);
		}
		await this.settle();
	}

	async tap(target: Target, options: TapOptions = {}): Promise<void> {
		await this.ready(target);
		await this.withTappable(target, (element) => element.click(options));
	}

	/** Press and hold. `ms` should be longer than the app's long-press delay. */
	async longPress(target: Target, ms = 1000): Promise<void> {
		await this.ready(target);
		await this.withTappable(target, (element) => element.press(ms));
	}

	/**
	 * Replace the field's value with `text`, then blur it. Ionic fires
	 * `ionChange` on blur, not on input.
	 */
	async type(target: Target, text: string): Promise<void> {
		await this.ready(target);
		// Pin the native field before filling: a textarea's accessible name
		// changes once it has a value, so a `{ label }` lookup can stop
		// resolving between fill and blur.
		const mark = this.nextMark();
		await this.driver.query(target).evaluate(markNativeField, mark);
		await this.onMarked(mark, async (input) => {
			await input.fill(text);
			await input.blur();
		});
	}

	/** Set an `ion-toggle` or `ion-checkbox` (or its label) to `on`. */
	async check(target: Target, on = true): Promise<void> {
		await this.ready(target);
		const element = this.driver.query(target);
		if ((await element.evaluate(isChecked, undefined)) !== on) {
			await this.withTappable(target, (tappable) => tappable.click());
		}
		await this.poll(
			async () => (await element.evaluate(isChecked, undefined)) === on,
			`${describeTarget(target)} to be ${on ? 'on' : 'off'}`,
		);
	}

	/**
	 * Pick `option` from an `ion-select`. Works with the alert, popover,
	 * action-sheet and modal interfaces. Returns once the overlay has left the
	 * DOM, so the next call cannot pick up one that is still fading out.
	 */
	async select(target: Target, option: string | RegExp): Promise<void> {
		await this.ready(target);
		await this.withTappable(target, (element) => element.click());

		const overlay = this.driver.query({ css: SELECT_OVERLAYS }).last();
		await overlay.waitFor();
		await this.settle();

		// Read this first: the other interfaces close as soon as an option is picked.
		const isAlert = (await overlay.evaluate(tagName, undefined)) === 'ION-ALERT';
		await this.tapQuery(overlay.query(option), (element) => element.click());
		// The alert interface is the only one that waits for a confirm button.
		if (isAlert) {
			await overlay.query({ css: 'button.alert-button:not(.alert-button-role-cancel)' }).last().click();
		}

		await this.driver.query({ css: SELECT_OVERLAYS }, { visibleOnly: false }).first().waitFor('detached');
	}

	/**
	 * Drag across `target`. Swipe `left` on an `ion-item-sliding` to reveal its
	 * end options.
	 */
	async swipe(target: Target, direction: SwipeDirection): Promise<void> {
		await this.ready(target);
		const element = this.driver.query(target);
		await element.scrollIntoView();
		const box = await element.box();
		if (box === null) {
			throw new Error(`swipe: ${describeTarget(target)} has no bounding box`);
		}

		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		const dx = { left: -1, right: 1, up: 0, down: 0 }[direction] * box.width * 0.4;
		const dy = { left: 0, right: 0, up: -1, down: 1 }[direction] * box.height * 0.4;
		await this.driver.drag({ x, y }, { x: x + dx, y: y + dy }, 10, () => this.afterDragStep());
		await this.settle();
	}

	/**
	 * Scroll the visible `ion-content` until `target` exists, then bring it
	 * into view. Handles lists that render more rows as you scroll.
	 */
	async scrollTo(target: Target, { maxScrolls = 30 } = {}): Promise<void> {
		const element = this.driver.query(target);
		for (let i = 0; i <= maxScrolls; i++) {
			if ((await element.count()) > 0) {
				await element.first().scrollIntoView();
				return;
			}
			await this.driver.query({ css: 'ion-content' }).last().evaluate(scrollContentBy, 0.8);
			await this.driver.sleep(150);
		}

		throw new Error(`scrollTo: ${describeTarget(target)} not found after ${maxScrolls} scrolls`);
	}

	/**
	 * Pull down on the visible `ion-content` that has an `ion-refresher` and
	 * wait for the refresh to finish (the app calls `complete()`).
	 */
	async pullToRefresh(): Promise<void> {
		await this.settle();
		const content = this.driver.query({ css: 'ion-content:has(ion-refresher)' }).last();
		const refresher = content.query({ css: 'ion-refresher' }, { visibleOnly: false }).first();
		await refresher.evaluate(prepareRefresher, undefined);
		// A refresher only arms at the top of the scroll.
		const headerOverlay = await content.evaluate(scrollContentToTop, undefined);
		await this.settle();

		const box = await content.box();
		if (box === null) {
			throw new Error('pullToRefresh: no visible ion-content with an ion-refresher');
		}
		// Start near the top, but below a header laid over a fullscreen ion-content.
		const from = { x: box.x + box.width / 2, y: box.y + headerOverlay + 30 };
		const to = { x: from.x, y: from.y + (await refresher.evaluate(refresherPullDistance, undefined)) };
		const refreshed = () => refresher.evaluate(hasRefreshed, undefined);
		// Let go once the refresh starts. A finger that keeps pulling after the
		// refresh completes starts another one.
		await this.driver.drag(from, to, 20, async () => (await this.afterDragStep()) || (await refreshed()));

		await this.poll(refreshed, 'ion-refresher to fire ionRefresh');
		await this.poll(() => refresher.evaluate(isRefreshFinished, undefined), 'ion-refresher to finish');
	}

	/** Tap the visible `ion-back-button`, or go back in history if there is none. */
	async back(): Promise<void> {
		await this.settle();
		const button = this.driver.query({ css: 'ion-back-button' });
		if ((await button.count()) > 0) {
			await button.click();
		} else {
			await this.driver.goBack();
		}
		await this.settle();
	}

	/** Wait until `target` is visible. */
	async see(target: Target, { timeout }: { timeout?: number } = {}): Promise<void> {
		await this.driver.query(target).first().waitFor('visible', timeout);
	}

	/** Wait until nothing matching `target` is visible. */
	async notSee(target: Target, { timeout }: { timeout?: number } = {}): Promise<void> {
		await this.driver.query(target).first().waitFor('hidden', timeout);
	}

	/**
	 * Run `action` on the element a finger would hit. Ionic sets
	 * `pointer-events: none` on labels inside segment and tab buttons, so a
	 * text match there is retargeted to the nearest ancestor that takes the
	 * tap.
	 */
	private async withTappable(target: Target, action: (element: Query) => Promise<void>): Promise<void> {
		await this.tapQuery(this.driver.query(target), action);
	}

	private async tapQuery(element: Query, action: (element: Query) => Promise<void>): Promise<void> {
		const mark = this.nextMark();
		if (await element.evaluate(markTappable, mark)) {
			await this.onMarked(mark, action);
		} else {
			await action(element);
		}
	}

	private nextMark(): string {
		return `e2e-${++this.marks}`;
	}

	/**
	 * Act on the element tagged `data-e2e="<mark>"`, then remove the tag. Used
	 * to hold on to one exact node across several driver calls.
	 */
	private async onMarked(mark: string, action: (element: Query) => Promise<void>): Promise<void> {
		const element = this.driver.query({ css: `[data-e2e="${mark}"]` }, { visibleOnly: false });
		try {
			await action(element);
		} finally {
			await element.evaluate(unmark, undefined).catch(() => undefined);
		}
	}

	/**
	 * Wait for `target` to be visible, then for the screen to settle. In that
	 * order: settling first can finish before a page transition the target is
	 * part of has even started, and the tap lands mid-animation.
	 */
	private async ready(target: Target): Promise<void> {
		// `first()`: mid-transition the old page can still show the same target.
		await this.driver.query(target).first().waitFor('visible');
		await this.settle();
	}

	/**
	 * Wait for Ionic transitions (page pushes, overlays, sliding items) to
	 * finish, and stay finished for a moment. Bounded, and never fails: an app
	 * with a looping animation just proceeds after the timeout.
	 */
	private async settle(): Promise<void> {
		await this.driver
			.waitForFunction(
				isSettled,
				{ ignoreLongerThan: SETTLE_IGNORE_LONGER_THAN_MS, quietFor: SETTLE_QUIET_MS, token: ++this.settles },
				{ timeout: SETTLE_TIMEOUT_MS, polling: 50 },
			)
			.catch(() => false);
	}

	/**
	 * Ionic gestures handle moves in the next animation frame; a burst of moves
	 * on a busy browser gets coalesced and the gesture ends short of its
	 * threshold. So drags wait a frame per step.
	 */
	private async afterDragStep(): Promise<boolean> {
		await this.driver.evaluate(nextFrame, undefined);
		return false;
	}

	private async poll(condition: () => Promise<boolean>, what: string, timeout = 5000): Promise<void> {
		const deadline = Date.now() + timeout;
		while (!(await condition())) {
			if (Date.now() > deadline) {
				throw new Error(`Timed out after ${timeout}ms waiting for ${what}`);
			}
			await this.driver.sleep(50);
		}
	}
}
