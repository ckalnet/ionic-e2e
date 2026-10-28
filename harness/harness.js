// One of every Ionic component the primitives touch. Each control writes what
// happened into a `data-testid` output so the spec can assert on it.

/** Stand-ins for Capacitor plugins, read through the same hook an app would use. */
const plugins = {
	Camera: window.__capMocks?.Camera ?? {
		getPhoto: async () => {
			throw new Error('Camera is not implemented on web.');
		},
	},
	Network: window.__capMocks?.Network ?? {
		addListener: async () => ({ remove: async () => undefined }),
		getStatus: async () => ({ connected: true }),
	},
};

function output(root, id, text) {
	root.querySelector(`[data-testid="${id}"]`).textContent = text;
}

class HarnessHome extends HTMLElement {
	connectedCallback() {
		this.innerHTML = `
			<ion-header>
				<ion-toolbar><ion-title>Harness</ion-title></ion-toolbar>
			</ion-header>
			<ion-content class="ion-padding">
				<ion-refresher slot="fixed">
					<ion-refresher-content></ion-refresher-content>
				</ion-refresher>
				<p data-testid="refresh-count">Refreshed 0 times</p>

				<ion-list>
					<ion-item>
						<ion-input label="Name" label-placement="stacked" data-testid="name-input"></ion-input>
					</ion-item>
					<ion-item>
						<ion-textarea label="Notes" label-placement="stacked"></ion-textarea>
					</ion-item>
					<ion-item>
						<ion-searchbar placeholder="Search people" data-testid="search"></ion-searchbar>
					</ion-item>
				</ion-list>
				<p data-testid="name-change">Name changed: (none)</p>
				<p data-testid="notes-change">Notes changed: (none)</p>
				<p data-testid="search-change">Search changed: (none)</p>

				<ion-list>
					<ion-item><ion-toggle>Notifications</ion-toggle></ion-item>
					<ion-item><ion-checkbox>Accept terms</ion-checkbox></ion-item>
				</ion-list>
				<p data-testid="notifications">Notifications: off</p>
				<p data-testid="terms">Terms: off</p>

				<ion-list>
					<ion-item>
						<ion-select label="Fruit" interface="alert" placeholder="Pick one">
							<ion-select-option value="apple">Apple</ion-select-option>
							<ion-select-option value="banana">Banana</ion-select-option>
							<ion-select-option value="cherry">Cherry</ion-select-option>
						</ion-select>
					</ion-item>
					<ion-item>
						<ion-select label="Color" interface="popover" placeholder="Pick one">
							<ion-select-option value="red">Red</ion-select-option>
							<ion-select-option value="green">Green</ion-select-option>
							<ion-select-option value="blue">Blue</ion-select-option>
						</ion-select>
					</ion-item>
					<ion-item>
						<ion-select label="Size" interface="action-sheet" placeholder="Pick one">
							<ion-select-option value="small">Small</ion-select-option>
							<ion-select-option value="medium">Medium</ion-select-option>
							<ion-select-option value="large">Large</ion-select-option>
						</ion-select>
					</ion-item>
					<ion-item>
						<ion-select label="Visit type" interface="modal" placeholder="Pick one">
							<ion-select-option value="intake">Intake</ion-select-option>
							<ion-select-option value="follow-up">Follow-up</ion-select-option>
						</ion-select>
					</ion-item>
				</ion-list>
				<p data-testid="selection">Selected: (none)</p>

				<ion-segment value="day">
					<ion-segment-button value="day"><ion-label>Day</ion-label></ion-segment-button>
					<ion-segment-button value="week"><ion-label>Week</ion-label></ion-segment-button>
				</ion-segment>
				<p data-testid="segment">View: day</p>

				<ion-radio-group value="phone">
					<ion-item><ion-radio value="phone">Phone</ion-radio></ion-item>
					<ion-item><ion-radio value="email">Email</ion-radio></ion-item>
				</ion-radio-group>
				<p data-testid="contact">Contact: phone</p>

				<ion-list data-testid="inbox">
					<ion-item-sliding>
						<ion-item><ion-label>Message from Ada</ion-label></ion-item>
						<ion-item-options side="end">
							<ion-item-option color="danger" data-action="delete">Delete</ion-item-option>
						</ion-item-options>
					</ion-item-sliding>
					<ion-item-sliding>
						<ion-item><ion-label>Message from Grace</ion-label></ion-item>
						<ion-item-options side="end">
							<ion-item-option color="danger" data-action="delete">Delete</ion-item-option>
						</ion-item-options>
					</ion-item-sliding>
				</ion-list>

				<ion-button id="delete-all" color="danger">Delete all</ion-button>
				<ion-button id="hold">Hold me</ion-button>
				<p data-testid="hold-result">Hold: (none)</p>

				<ion-button id="open-modal">Open modal</ion-button>
				<ion-modal trigger="open-modal">
					<ion-header>
						<ion-toolbar>
							<ion-title>Edit note</ion-title>
							<ion-buttons slot="end"><ion-button id="close-modal">Close</ion-button></ion-buttons>
						</ion-toolbar>
					</ion-header>
					<ion-content class="ion-padding">
						<ion-input label="Modal field" data-testid="modal-input"></ion-input>
					</ion-content>
				</ion-modal>
				<p data-testid="modal-result">Modal: (none)</p>

				<ion-button id="take-photo">Take photo</ion-button>
				<p data-testid="photo">Photo: (none)</p>
				<p data-testid="network">Network: online</p>

				<ion-button id="load-profile">Load profile</ion-button>
				<p data-testid="profile">Profile: (none)</p>

				<ion-button id="ping">Ping</ion-button>
				<p data-testid="ping-home">Home pings: 0</p>
				<ion-button id="open-list">Open list</ion-button>
			</ion-content>
		`;

		const on = (selector, event, handler) => this.querySelector(selector).addEventListener(event, handler);

		let refreshes = 0;
		on('ion-refresher', 'ionRefresh', (event) => {
			setTimeout(() => {
				refreshes++;
				output(this, 'refresh-count', `Refreshed ${refreshes} ${refreshes === 1 ? 'time' : 'times'}`);
				event.target.complete();
			}, 300);
		});

		on('ion-input', 'ionChange', (event) => output(this, 'name-change', `Name changed: ${event.detail.value}`));
		on('ion-textarea', 'ionChange', (event) => output(this, 'notes-change', `Notes changed: ${event.detail.value}`));
		on('ion-searchbar', 'ionChange', (event) => output(this, 'search-change', `Search changed: ${event.detail.value}`));
		on('ion-toggle', 'ionChange', (event) => output(this, 'notifications', `Notifications: ${event.detail.checked ? 'on' : 'off'}`));
		on('ion-checkbox', 'ionChange', (event) => output(this, 'terms', `Terms: ${event.detail.checked ? 'on' : 'off'}`));
		on('ion-segment', 'ionChange', (event) => output(this, 'segment', `View: ${event.detail.value}`));
		on('ion-radio-group', 'ionChange', (event) => output(this, 'contact', `Contact: ${event.detail.value}`));

		this.querySelectorAll('ion-select').forEach((select) =>
			select.addEventListener('ionChange', (event) => output(this, 'selection', `Selected: ${select.label} = ${event.detail.value}`)),
		);

		this.querySelectorAll('[data-action="delete"]').forEach((option) =>
			option.addEventListener('click', () => option.closest('ion-item-sliding').remove()),
		);

		on('#delete-all', 'click', async () => {
			const alert = document.createElement('ion-alert');
			alert.header = 'Delete everything?';
			alert.message = 'This cannot be undone.';
			alert.buttons = [
				{ text: 'Cancel', role: 'cancel' },
				{ text: 'Delete', role: 'destructive', handler: () => this.querySelector('[data-testid="inbox"]').replaceChildren() },
			];
			document.body.appendChild(alert);
			await alert.present();
			const { role } = await alert.onDidDismiss();
			alert.remove();
			if (role === 'destructive') {
				const toast = document.createElement('ion-toast');
				toast.message = 'All messages deleted';
				toast.duration = 1500;
				document.body.appendChild(toast);
				await toast.present();
				await toast.onDidDismiss();
				toast.remove();
			}
		});

		// Pointer-event long press, the usual shape of a long-press directive
		// (500ms, cancelled by pointerup/leave).
		const hold = this.querySelector('#hold');
		let timer;
		let longPressed = false;
		hold.addEventListener('pointerdown', () => {
			longPressed = false;
			timer = setTimeout(() => {
				longPressed = true;
				output(this, 'hold-result', 'Hold: long press');
			}, 500);
		});
		for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
			hold.addEventListener(event, () => clearTimeout(timer));
		}
		hold.addEventListener('click', () => {
			if (!longPressed) output(this, 'hold-result', 'Hold: tap');
		});

		const modal = this.querySelector('ion-modal');
		on('#close-modal', 'click', () => modal.dismiss());
		modal.addEventListener('ionModalDidDismiss', () =>
			output(this, 'modal-result', `Modal: ${modal.querySelector('[data-testid="modal-input"]').value ?? ''}`),
		);

		on('#take-photo', 'click', async () => {
			try {
				const photo = await plugins.Camera.getPhoto({ quality: 90 });
				output(this, 'photo', `Photo: ${photo?.webPath ?? '(empty)'}`);
			} catch (error) {
				output(this, 'photo', `Photo error: ${error.message}`);
			}
		});
		plugins.Network.addListener('networkStatusChange', (status) =>
			output(this, 'network', `Network: ${status.connected ? 'online' : 'offline'}`),
		);

		on('#load-profile', 'click', async () => {
			const response = await fetch('/api/profile');
			if (!response.ok) {
				output(this, 'profile', `Profile error: ${response.status}`);
				return;
			}
			const profile = await response.json();
			output(this, 'profile', `Profile: ${profile.name}`);
		});

		let pings = 0;
		on('#ping', 'click', () => output(this, 'ping-home', `Home pings: ${++pings}`));
		on('#open-list', 'click', () => document.querySelector('ion-nav').push('harness-list'));
	}
}

/** A pushed page: back button, a long list that grows on scroll, and its own Ping. */
class HarnessList extends HTMLElement {
	connectedCallback() {
		this.innerHTML = `
			<ion-header>
				<ion-toolbar>
					<ion-buttons slot="start"><ion-back-button></ion-back-button></ion-buttons>
					<ion-title>Long list</ion-title>
				</ion-toolbar>
			</ion-header>
			<ion-content>
				<ion-button id="ping">Ping</ion-button>
				<p data-testid="ping-list">List pings: 0</p>
				<p data-testid="picked">Picked: (none)</p>
				<ion-list></ion-list>
				<ion-infinite-scroll>
					<ion-infinite-scroll-content></ion-infinite-scroll-content>
				</ion-infinite-scroll>
			</ion-content>
		`;

		let pings = 0;
		this.querySelector('#ping').addEventListener('click', () => output(this, 'ping-list', `List pings: ${++pings}`));

		const list = this.querySelector('ion-list');
		const total = 200;
		const append = (count) => {
			const start = list.children.length;
			for (let i = start + 1; i <= Math.min(start + count, total); i++) {
				const item = document.createElement('ion-item');
				item.button = true;
				item.innerHTML = `<ion-label>Item ${i}</ion-label>`;
				item.addEventListener('click', () => output(this, 'picked', `Picked: Item ${i}`));
				list.appendChild(item);
			}
		};
		append(40);

		const infinite = this.querySelector('ion-infinite-scroll');
		infinite.addEventListener('ionInfinite', () => {
			setTimeout(() => {
				append(40);
				infinite.complete();
				infinite.disabled = list.children.length >= total;
			}, 100);
		});
	}
}

customElements.define('harness-home', HarnessHome);
customElements.define('harness-list', HarnessList);
