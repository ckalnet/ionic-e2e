import { expect, test } from './fixtures';

/**
 * Self-test for the primitives. This spec is the source of truth for how each
 * one behaves; change it whenever a primitive changes.
 *
 * Tests on `app` run on every driver, so they assert with `see`/`notSee`.
 * Tests on `web` need the Playwright driver and are skipped on devices.
 */

test.beforeEach(async ({ app }) => {
	await app.launch('/');
	await app.see('Harness');
});

test.describe('targets', () => {
	test('a bare string is exact visible text', async ({ app }) => {
		await app.see('Delete all');
		await app.notSee('Delete al');
	});

	test('id, label, role and css all resolve', async ({ app }) => {
		await app.see({ id: 'refresh-count' });
		await app.see({ label: 'Name' });
		await app.see({ role: 'button', name: 'Delete all' });
		await app.see({ css: '#delete-all' });
	});

	test('pages ion-nav has hidden are not matched', async ({ app }) => {
		await app.tap('Open list');
		await app.see('Long list');

		// "Ping" is on both pages; only the visible one counts.
		await app.tap('Ping');
		await app.see('List pings: 1');
		await app.notSee({ id: 'ping-home' });

		await app.back();
		await app.see('Harness');
		await app.tap('Ping');
		await app.see('Home pings: 1');
	});
});

test.describe('type', () => {
	test('fills, then blurs so ionChange fires', async ({ app }) => {
		await app.type({ label: 'Name' }, 'Ada Lovelace');
		await app.see('Name changed: Ada Lovelace');
	});

	test('replaces the existing value', async ({ app }) => {
		await app.type({ id: 'name-input' }, 'first');
		await app.type({ id: 'name-input' }, 'second');
		await app.see('Name changed: second');
	});

	test('works on ion-textarea and ion-searchbar', async ({ app }) => {
		await app.type({ label: 'Notes' }, 'Seen today');
		await app.see('Notes changed: Seen today');

		await app.type({ id: 'search' }, 'Grace');
		await app.see('Search changed: Grace');
	});
});

test.describe('check', () => {
	test('turns an ion-toggle on and off by its label text', async ({ app }) => {
		await app.check('Notifications');
		await app.see('Notifications: on');

		// Already on: no click, so it stays on.
		await app.check('Notifications');
		await app.see('Notifications: on');

		await app.check('Notifications', false);
		await app.see('Notifications: off');
	});

	test('ticks an ion-checkbox by its accessible label', async ({ app }) => {
		await app.check({ label: 'Accept terms' });
		await app.see('Terms: on');
	});
});

test.describe('select', () => {
	test('alert interface', async ({ app }) => {
		await app.select({ label: 'Fruit' }, 'Banana');
		await app.see('Selected: Fruit = banana');
	});

	test('popover interface', async ({ app }) => {
		await app.select({ label: 'Color' }, 'Green');
		await app.see('Selected: Color = green');
	});

	test('action-sheet interface', async ({ app }) => {
		await app.select({ label: 'Size' }, 'Large');
		await app.see('Selected: Size = large');
	});

	test('modal interface', async ({ app }) => {
		await app.select({ label: 'Visit type' }, 'Follow-up');
		await app.see('Selected: Visit type = follow-up');
	});

	test('back-to-back selects do not pick up a closing overlay', async ({ app }) => {
		await app.select({ label: 'Fruit' }, 'Cherry');
		await app.select({ label: 'Color' }, 'Blue');
		await app.select({ label: 'Fruit' }, 'Apple');
		await app.select({ label: 'Size' }, 'Small');
		await app.see('Selected: Size = small');
		await app.notSee({ css: '.select-alert, .select-popover, .select-action-sheet' });
	});
});

test.describe('tap', () => {
	test('ion-segment and ion-radio', async ({ app }) => {
		await app.tap('Week');
		await app.see('View: week');

		await app.tap('Email');
		await app.see('Contact: email');
	});

	test('alert buttons, then a toast', async ({ app }) => {
		await app.tap('Delete all');
		await app.see('Delete everything?');
		await app.tap('Delete');

		await app.see('All messages deleted');
		await app.notSee('Message from Ada');
		await app.notSee('All messages deleted', { timeout: 5000 });
	});

	test('inline ion-modal', async ({ app }) => {
		await app.notSee({ id: 'modal-input' });
		await app.tap('Open modal');
		await app.see('Edit note');
		await app.type({ id: 'modal-input' }, 'From the modal');
		await app.tap('Close');
		await app.notSee('Edit note');
		await app.see('Modal: From the modal');
	});

	test('viaScript clicks in the page instead of tapping', async ({ app }) => {
		await app.tap('Week', { viaScript: true });
		await app.see('View: week');
	});
});

test('longPress holds; tap does not count as one', async ({ app }) => {
	await app.tap('Hold me');
	await app.see('Hold: tap');

	await app.longPress('Hold me');
	await app.see('Hold: long press');
});

test('swipe opens ion-item-sliding options', async ({ app }) => {
	await app.scrollTo('Message from Grace');
	await app.swipe('Message from Grace', 'left');
	await app.tap('Delete');
	await app.notSee('Message from Grace');
	await app.see('Message from Ada');
});

test('pullToRefresh waits for the refresh to complete', async ({ app }) => {
	await app.pullToRefresh();
	await app.see('Refreshed 1 time');
});

test('scrollTo reaches rows that ion-infinite-scroll has not rendered yet', async ({ app }) => {
	await app.tap('Open list');
	await app.notSee('Item 150');

	await app.scrollTo('Item 150');
	await app.tap('Item 150');
	await app.see('Picked: Item 150');
});

test.describe('find (Playwright)', () => {
	test('returns a visible-filtered locator for expect', async ({ web }) => {
		await expect(web.find({ id: 'refresh-count' })).toHaveText('Refreshed 0 times');
		await expect(web.find({ label: 'Name' })).toHaveCount(1);
	});
});

test.describe('mockApi', () => {
	test('answers with JSON', async ({ web }) => {
		await web.mockApi('**/api/profile', { name: 'Ada' });
		await web.tap('Load profile');
		await web.see('Profile: Ada');
	});

	test('status, and a body built from the request', async ({ web }) => {
		await web.mockApi('**/api/profile', (request) => ({ name: request.method() }));
		await web.tap('Load profile');
		await web.see('Profile: GET');

		await web.mockApi('**/api/profile', null, { status: 503 });
		await web.tap('Load profile');
		await web.see('Profile error: 503');
	});

	test('a method filter lets other methods fall through', async ({ web }) => {
		await web.mockApi('**/api/profile', { name: 'Ada' });
		await web.mockApi('**/api/profile', { name: 'Posted' }, { method: 'POST' });
		await web.tap('Load profile');
		await web.see('Profile: Ada');
	});
});

test.describe('mockPlugin', () => {
	// mockPlugin has to run before the app loads, so these relaunch.
	test('a value becomes the resolved result', async ({ web }) => {
		await web.mockPlugin('Camera', { getPhoto: { webPath: 'mock://photo.jpg' } });
		await web.launch('/');
		await web.tap('Take photo');
		await web.see('Photo: mock://photo.jpg');
	});

	test('a function runs in the browser with the call arguments', async ({ web }) => {
		await web.mockPlugin('Camera', {
			getPhoto(options: { quality: number }) {
				return { webPath: `quality-${options.quality}.jpg` };
			},
		});
		await web.launch('/');
		await web.tap('Take photo');
		await web.see('Photo: quality-90.jpg');
	});

	test('an arrow function that throws surfaces as a plugin error', async ({ web }) => {
		await web.mockPlugin('Camera', {
			getPhoto: () => Promise.reject(new Error('User cancelled photos app')),
		});
		await web.launch('/');
		await web.tap('Take photo');
		await web.see('Photo error: User cancelled photos app');
	});

	test('methods left out resolve to undefined', async ({ web }) => {
		await web.mockPlugin('Camera', {});
		await web.launch('/');
		await web.tap('Take photo');
		await web.see('Photo: (empty)');
	});

	test('firePluginEvent calls the listeners the app added', async ({ web }) => {
		await web.mockPlugin('Network', { getStatus: { connected: true } });
		await web.launch('/');
		await web.firePluginEvent('Network', 'networkStatusChange', { connected: false });
		await web.see('Network: offline');
	});

	test('firePluginEvent fails when nothing listens', async ({ web }) => {
		await web.mockPlugin('Network', {});
		await web.launch('/');
		await expect(web.firePluginEvent('Network', 'nobodyListens')).rejects.toThrow(/nothing is listening/);
	});
});
