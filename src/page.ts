/**
 * Functions that run inside the app's page, through either driver. Each one
 * is sent to the browser as source, so it must be self-contained: no imports,
 * no module-level names, only its own arguments.
 */
import type { SerializedTarget } from './target.js';

export interface SettleArgs {
	/** Animations running longer than this are decoration, not transitions. */
	ignoreLongerThan: number;
	/** How long the screen has to stay still. */
	quietFor: number;
	/** New for each settle() call, so a stale "quiet since" is never reused. */
	token: number;
}

/**
 * True once no Ionic transition (page push, overlay, sliding item) has run
 * for `quietFor` ms. Meant to be polled.
 */
export function isSettled({ ignoreLongerThan, quietFor, token }: SettleArgs): boolean {
	const state = window as unknown as { __e2eSettle?: { token: number; since?: number } };
	if (state.__e2eSettle?.token !== token) {
		state.__e2eSettle = { token };
	}
	const animating = document.getAnimations().some((animation) => {
		if (animation.playState !== 'running') {
			return false;
		}
		const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
		return Number.isFinite(end) && end - Number(animation.currentTime ?? 0) <= ignoreLongerThan;
	});
	// Ionic marks a page that is about to transition in before its animation
	// starts.
	if (animating || document.querySelector('.ion-page-invisible') !== null) {
		state.__e2eSettle.since = undefined;
		return false;
	}
	state.__e2eSettle.since ??= performance.now();
	return performance.now() - state.__e2eSettle.since >= quietFor;
}

export function isIonicReady(): boolean {
	return customElements.get('ion-app') !== undefined && document.querySelector('ion-app') !== null;
}

/** The checked state of the ion-toggle / ion-checkbox that `start` is, or labels. */
export function isChecked(start: Element): boolean {
	const controls = 'ion-toggle, ion-checkbox';
	// Walk up through shadow roots: `{ label }` can resolve to the native input
	// inside the toggle's shadow DOM.
	let node: Element | null = start;
	while (node !== null && !node.matches(controls)) {
		node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
	}
	const control = node ?? start.querySelector(controls) ?? start.closest('ion-item')?.querySelector(controls) ?? start;
	return (control as HTMLInputElement).checked === true;
}

/**
 * Find what a finger on `start` actually taps, and tag it `data-e2e=<mark>`;
 * returns false when that is `start` itself. Two cases: Ionic sets
 * `pointer-events: none` on labels inside segment and tab buttons, and text
 * inside a button or link taps the button or link (Playwright retargets that
 * way; WebDriver doesn't, and reports the click as intercepted).
 */
export function markTappable(start: Element, mark: string): boolean {
	let node: Element | null = start;
	while (node !== null && getComputedStyle(node).pointerEvents === 'none') {
		node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
	}
	node = node?.closest('button, a[href], [role="button"], [role="link"]') ?? node;
	if (node === null || node === start) {
		return false;
	}
	node.setAttribute('data-e2e', mark);
	return true;
}

/** Tag the native input/textarea behind an Ionic field with `data-e2e=<mark>`. */
export function markNativeField(element: Element, mark: string): void {
	const selector = 'input, textarea';
	const isNative = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
	const input = isNative ? element : (element.querySelector(selector) ?? element.shadowRoot?.querySelector(selector));
	if (!input) {
		throw new Error(`type: <${element.tagName.toLowerCase()}> has no input or textarea`);
	}
	input.setAttribute('data-e2e', mark);
}

export function unmark(element: Element): void {
	element.removeAttribute('data-e2e');
}

/**
 * Wait for an ion-refresher to finish setting up its pull gesture (a pull
 * during setup is dropped), and start recording whether it fires.
 */
export async function prepareRefresher(element: Element): Promise<void> {
	type Refresher = HTMLElement & {
		__e2eRefreshed?: boolean;
		__e2eFinished?: boolean;
		componentOnReady?(): Promise<unknown>;
	};
	const refresher = element as Refresher;
	await refresher.componentOnReady?.();
	await refresher.querySelector<Refresher>('ion-refresher-content')?.componentOnReady?.();
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	refresher.__e2eRefreshed = false;
	refresher.__e2eFinished = false;
	refresher.addEventListener('ionRefresh', () => (refresher.__e2eRefreshed = true), { once: true });
	refresher.addEventListener('ionPullEnd', (event) => {
		if ((event as CustomEvent<{ reason?: string }>).detail?.reason === 'complete') refresher.__e2eFinished = true;
	});
}

/**
 * How far to pull: a little past what this refresher needs. Ionic's standard
 * gesture refreshes past `pullMax` (scaled by `pullFactor`); the MD native one
 * past 40% of 360px. Pulling much further keeps the finger down after a fast
 * refresh completes, which starts a second one.
 *
 * The iOS native refresher (iOS mode on a real iOS browser) is the exception:
 * it follows the scroll view's rubber-band overscroll, which resists the
 * finger, and needs about 30px plus 16% of the content's height of it. So the
 * finger travels much further; this refresher won't start a second refresh
 * while the finger is still down.
 */
export function refresherPullDistance(element: Element): number {
	if (element.classList.contains('refresher-native') && element.classList.contains('refresher-ios')) {
		const content = element.closest('ion-content');
		return Math.max(400, (content?.clientHeight ?? 0) * 0.7);
	}
	const refresher = element as HTMLElement & { pullMax?: number; pullFactor?: number };
	const factor = refresher.pullFactor !== undefined && refresher.pullFactor > 0 ? refresher.pullFactor : 1;
	return Math.max((refresher.pullMax ?? 120) / factor, 144) + 60;
}

export function hasRefreshed(element: Element): boolean {
	return (element as HTMLElement & { __e2eRefreshed?: boolean }).__e2eRefreshed === true;
}

/**
 * True once the refresh has finished. Ionic emits `ionPullEnd` with reason
 * "complete" when the refresher has reset after `complete()`. The class check
 * is a fallback; on its own it is not enough: the iOS native refresher can
 * show "pulling" again from the scroll view bouncing back after a long pull,
 * though it has already finished.
 */
export function isRefreshFinished(element: Element): boolean {
	return (
		(element as HTMLElement & { __e2eFinished?: boolean }).__e2eFinished === true ||
		!element.classList.contains('refresher-active')
	);
}

/** Scroll an ion-content to the top; returns the header height laid over it, if fullscreen. */
export async function scrollContentToTop(element: Element): Promise<number> {
	const content = element as HTMLElement & { fullscreen?: boolean; scrollToTop(duration?: number): Promise<void> };
	await content.scrollToTop(0);
	return content.fullscreen === true
		? (content.closest('.ion-page')?.querySelector('ion-header')?.getBoundingClientRect().height ?? 0)
		: 0;
}

export async function scrollContentBy(element: Element, fraction: number): Promise<void> {
	const content = element as HTMLElement & { getScrollElement(): Promise<HTMLElement> };
	const scroller = await content.getScrollElement();
	scroller.scrollBy(0, scroller.clientHeight * fraction);
}

export function tagName(element: Element): string {
	return element.tagName;
}

export function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Find the elements `target` matches, the way the Playwright driver's
 * locators do: visible only, exact text, accessible labels and roles,
 * through open shadow roots. Used by drivers without Playwright's locators.
 */
export function resolveTarget(target: SerializedTarget, scope: Element | null, visibleOnly: boolean): Element[] {
	const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
	const textMatches = (value: string, wanted: SerializedText) =>
		typeof wanted === 'string' ? value === wanted : new RegExp(wanted.source, wanted.flags).test(value);
	type SerializedText = string | { source: string; flags: string };

	const roots: Array<Document | Element | ShadowRoot> = [scope ?? document];
	const all: Element[] = [];
	for (let index = 0; index < roots.length; index++) {
		for (const element of roots[index].querySelectorAll('*')) {
			all.push(element);
			if (element.shadowRoot) roots.push(element.shadowRoot);
		}
	}
	if (scope) all.unshift(scope);

	const skipped = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'TEMPLATE', 'NOSCRIPT']);
	const isVisible = (element: Element) => {
		if (element.classList.contains('cloned-input')) return false;
		if (element.getClientRects().length === 0) return false;
		return getComputedStyle(element).visibility !== 'hidden';
	};

	const implicitRole = (element: Element): string | null => {
		const tag = element.tagName.toLowerCase();
		const type = (element.getAttribute('type') ?? 'text').toLowerCase();
		if (tag === 'button') return 'button';
		if (tag === 'a' && element.hasAttribute('href')) return 'link';
		if (/^h[1-6]$/.test(tag)) return 'heading';
		if (tag === 'textarea') return 'textbox';
		if (tag === 'select') return 'combobox';
		if (tag === 'img') return 'img';
		if (tag === 'li') return 'listitem';
		if (tag === 'ul' || tag === 'ol') return 'list';
		if (tag === 'nav') return 'navigation';
		if (tag === 'main') return 'main';
		if (tag === 'p') return 'paragraph';
		if (tag === 'input') {
			if (type === 'checkbox') return 'checkbox';
			if (type === 'radio') return 'radio';
			if (type === 'search') return 'searchbox';
			if (['button', 'submit', 'reset'].includes(type)) return 'button';
			if (type === 'range') return 'slider';
			if (type === 'hidden') return null;
			return 'textbox';
		}
		return null;
	};
	const roleOf = (element: Element) => element.getAttribute('role')?.split(' ')[0] ?? implicitRole(element);

	const nameFromContent = new Set([
		'button', 'link', 'heading', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'menuitemcheckbox',
		'menuitemradio', 'option', 'cell', 'columnheader', 'rowheader', 'gridcell', 'treeitem', 'tooltip',
	]);
	// Text as rendered: through shadow roots and into slotted content, which
	// textContent skips (ion-button's inner <button> gets its text via a slot).
	const flatText = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) return (node as Text).data;
		if (node.nodeType !== Node.ELEMENT_NODE) return '';
		const element = node as Element;
		if (skipped.has(element.tagName)) return '';
		if (element instanceof HTMLSlotElement) {
			const assigned = element.assignedNodes({ flatten: true });
			return (assigned.length > 0 ? assigned : [...element.childNodes]).map(flatText).join('');
		}
		return [...(element.shadowRoot ?? element).childNodes].map(flatText).join('');
	};
	// Ionic points aria-labelledby into the host's own shadow root
	// (ion-checkbox), so look there first.
	const byId = (element: Element, id: string) =>
		element.shadowRoot?.getElementById(id) ??
		(element.getRootNode() as Document | ShadowRoot).getElementById(id) ??
		document.getElementById(id);
	const accessibleName = (element: Element): string => {
		const labelledBy = element.getAttribute('aria-labelledby');
		if (labelledBy) {
			return normalize(labelledBy.split(/\s+/).map((id) => { const label = byId(element, id); return label ? flatText(label) : ''; }).join(' '));
		}
		const ariaLabel = element.getAttribute('aria-label');
		if (ariaLabel) return normalize(ariaLabel);
		const labels = (element as HTMLInputElement).labels;
		if (labels && labels.length > 0) {
			return normalize([...labels].map(flatText).join(' '));
		}
		if (element.tagName === 'IMG') return normalize(element.getAttribute('alt'));
		const role = roleOf(element);
		if (role !== null && nameFromContent.has(role)) return normalize(flatText(element));
		return normalize(element.getAttribute('title'));
	};

	let matches: Element[];
	switch (target.kind) {
		case 'css': {
			const found = new Set<Element>();
			for (const root of roots) for (const element of root.querySelectorAll(target.css)) found.add(element);
			if (scope?.matches(target.css)) found.add(scope);
			matches = all.filter((element) => found.has(element));
			break;
		}
		case 'id':
			matches = all.filter((element) => element.getAttribute('data-testid') === target.id);
			break;
		case 'text': {
			const own = all.filter((element) => !skipped.has(element.tagName) && textMatches(normalize(element.textContent), target.text));
			// Innermost only: drop an element when one of its descendants matches too.
			matches = own.filter((element) => !own.some((other) => other !== element && element.contains(other)));
			break;
		}
		case 'role':
			matches = all.filter((element) => {
				if (roleOf(element) !== target.role) return false;
				return target.name === undefined || textMatches(accessibleName(element), target.name);
			});
			break;
		case 'label': {
			const wanted = target.label;
			const selectName =
				typeof wanted === 'string'
					? { source: `^${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`, flags: '' }
					: wanted;
			matches = all.filter((element) => {
				const role = roleOf(element);
				const labelled =
					element.hasAttribute('aria-label') ||
					element.hasAttribute('aria-labelledby') ||
					((element as HTMLInputElement).labels?.length ?? 0) > 0;
				if (labelled && role !== 'button' && textMatches(accessibleName(element), wanted)) return true;
				if ((role === 'checkbox' || role === 'switch' || role === 'radio') && textMatches(accessibleName(element), wanted)) {
					return true;
				}
				// ion-select's inner button is named "<label>, <value or placeholder>".
				if (element.tagName === 'ION-SELECT') {
					const button = element.shadowRoot?.querySelector('button');
					return button !== null && button !== undefined && textMatches(accessibleName(button), selectName);
				}
				return false;
			});
			// A labelled native input inside a labelled Ionic host is one target.
			matches = matches.filter((element) => !matches.some((other) => other !== element && other.shadowRoot?.contains(element)));
			break;
		}
	}
	return visibleOnly ? matches.filter(isVisible) : matches.filter((element) => !element.classList.contains('cloned-input'));
}
