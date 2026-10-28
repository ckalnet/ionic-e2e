/**
 * What a primitive acts on.
 *
 * - a bare string (or RegExp) is visible text, matched exactly
 * - `{ id }` is a `data-testid`
 * - `{ label }` is an accessible label (`<label>`, `aria-label`, Ionic `label` prop)
 * - `{ role, name }` is an ARIA role with an optional accessible name
 * - `{ css }` is a CSS selector
 *
 * Every lookup is filtered to visible elements. Ionic keeps pages it has
 * navigated away from in the DOM (hidden), so an unfiltered text match would
 * hit a stale page.
 */
export type Target =
	| string
	| RegExp
	| { id: string }
	| { label: string | RegExp }
	| { role: AriaRole; name?: string | RegExp }
	| { css: string };

/** ARIA roles accepted by `{ role }` targets. */
export type AriaRole =
	| 'alert'
	| 'alertdialog'
	| 'application'
	| 'article'
	| 'banner'
	| 'blockquote'
	| 'button'
	| 'caption'
	| 'cell'
	| 'checkbox'
	| 'code'
	| 'columnheader'
	| 'combobox'
	| 'complementary'
	| 'contentinfo'
	| 'definition'
	| 'deletion'
	| 'dialog'
	| 'directory'
	| 'document'
	| 'emphasis'
	| 'feed'
	| 'figure'
	| 'form'
	| 'generic'
	| 'grid'
	| 'gridcell'
	| 'group'
	| 'heading'
	| 'img'
	| 'insertion'
	| 'link'
	| 'list'
	| 'listbox'
	| 'listitem'
	| 'log'
	| 'main'
	| 'marquee'
	| 'math'
	| 'meter'
	| 'menu'
	| 'menubar'
	| 'menuitem'
	| 'menuitemcheckbox'
	| 'menuitemradio'
	| 'navigation'
	| 'none'
	| 'note'
	| 'option'
	| 'paragraph'
	| 'presentation'
	| 'progressbar'
	| 'radio'
	| 'radiogroup'
	| 'region'
	| 'row'
	| 'rowgroup'
	| 'rowheader'
	| 'scrollbar'
	| 'search'
	| 'searchbox'
	| 'separator'
	| 'slider'
	| 'spinbutton'
	| 'status'
	| 'strong'
	| 'subscript'
	| 'superscript'
	| 'switch'
	| 'tab'
	| 'table'
	| 'tablist'
	| 'tabpanel'
	| 'term'
	| 'textbox'
	| 'time'
	| 'timer'
	| 'toolbar'
	| 'tooltip'
	| 'tree'
	| 'treegrid'
	| 'treeitem';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface Point {
	x: number;
	y: number;
}

export interface Box extends Point {
	width: number;
	height: number;
}

/** A `Target` that can cross into the page: RegExps become `{ source, flags }`. */
export type SerializedText = string | { source: string; flags: string };
export type SerializedTarget =
	| { kind: 'text'; text: SerializedText }
	| { kind: 'id'; id: string }
	| { kind: 'label'; label: SerializedText }
	| { kind: 'role'; role: string; name?: SerializedText }
	| { kind: 'css'; css: string };

export function serializeTarget(target: Target): SerializedTarget {
	const text = (value: string | RegExp): SerializedText =>
		value instanceof RegExp ? { source: value.source, flags: value.flags } : value;
	if (typeof target === 'string' || target instanceof RegExp) return { kind: 'text', text: text(target) };
	if ('id' in target) return { kind: 'id', id: target.id };
	if ('label' in target) return { kind: 'label', label: text(target.label) };
	if ('role' in target) {
		return target.name === undefined
			? { kind: 'role', role: target.role }
			: { kind: 'role', role: target.role, name: text(target.name) };
	}
	return { kind: 'css', css: target.css };
}

export function describeTarget(target: Target): string {
	return target instanceof RegExp ? String(target) : JSON.stringify(target);
}

export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
