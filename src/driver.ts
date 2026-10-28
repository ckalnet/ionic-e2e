import type { Box, Point, Target } from './target.js';

/** A function that runs in the page against one element. */
export type ElementFunction<A, R> = (element: Element, arg: A) => R | Promise<R>;
/** A function that runs in the page. */
export type PageFunction<A, R> = (arg: A) => R | Promise<R>;

export interface QueryOptions {
	/** Match only visible elements (the default). */
	visibleOnly?: boolean;
}

/**
 * A lazy element lookup, re-resolved on every use (like a Playwright
 * locator). Actions and `evaluate` are strict: they fail if more than one
 * element matches.
 */
export interface Query {
	first(): Query;
	last(): Query;
	/** Elements matching `target` inside this one. */
	query(target: Target, options?: QueryOptions): Query;
	count(): Promise<number>;
	waitFor(state?: 'visible' | 'hidden' | 'detached', timeout?: number): Promise<void>;
	evaluate<A, R>(fn: ElementFunction<A, R>, arg: A): Promise<R>;
	/** `viaScript` clicks with `element.click()` in the page instead of a real tap. */
	click(options?: { viaScript?: boolean }): Promise<void>;
	/** Replace the value of a native input or textarea. */
	fill(text: string): Promise<void>;
	blur(): Promise<void>;
	/** Press and hold for `ms`. */
	press(ms: number): Promise<void>;
	scrollIntoView(): Promise<void>;
	/** Position in CSS pixels, relative to the viewport. */
	box(): Promise<Box | null>;
}

/** What `IonicApp` needs from a browser or device automation library. */
export interface Driver {
	readonly name: 'playwright' | 'appium';
	query(target: Target, options?: QueryOptions): Query;
	evaluate<A, R>(fn: PageFunction<A, R>, arg: A): Promise<R>;
	/** Poll `fn` until it returns true. Resolves false on timeout. */
	waitForFunction<A>(fn: PageFunction<A, boolean>, arg: A, options: { timeout: number; polling: number }): Promise<boolean>;
	goto(path: string): Promise<void>;
	goBack(): Promise<void>;
	/**
	 * Press at `from`, move to `to` in `steps`, release. `afterStep` runs after
	 * each step; returning true releases early. A driver that has to send the
	 * gesture as one sequence (Appium) runs it to the end without calling it.
	 */
	drag(from: Point, to: Point, steps: number, afterStep: () => Promise<boolean>): Promise<void>;
	sleep(ms: number): Promise<void>;
}
