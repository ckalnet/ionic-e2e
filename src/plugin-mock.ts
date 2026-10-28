/**
 * A stand-in for a Capacitor plugin, keyed by method name.
 *
 * A plain value becomes a method that resolves to it. A function is sent to the
 * browser as source, so it cannot use variables from the test file. Methods you
 * leave out resolve to `undefined`. `addListener` is provided for you; trigger
 * listeners with `firePluginEvent`.
 */
export type PluginMock = Record<string, unknown>;

/** Build the init script that installs `window.__capMocks[name]`. */
export function pluginMockScript(name: string, mock: PluginMock): string {
	const methods = Object.entries(mock)
		.map(([method, value]) => `${JSON.stringify(method)}: ${methodSource(method, value)}`)
		.join(',\n');

	return `(() => {
	const name = ${JSON.stringify(name)};
	const mocks = (window.__capMocks ??= {});
	const allListeners = (window.__capMockListeners ??= {});
	const listeners = (allListeners[name] ??= {});
	const methods = {
		addListener: async (event, callback) => {
			(listeners[event] ??= []).push(callback);
			return { remove: async () => { listeners[event] = listeners[event].filter((l) => l !== callback); } };
		},
		removeAllListeners: async () => { for (const event of Object.keys(listeners)) delete listeners[event]; },
		${methods}
	};
	mocks[name] = new Proxy(methods, {
		get(target, property) {
			if (property in target) return target[property];
			// Not thenable, or awaiting the plugin would hang.
			if (property === 'then' || typeof property === 'symbol') return undefined;
			return async () => undefined;
		},
	});
})();`;
}

/** Call the listeners the app added on mocked plugin `name`. Runs in the page. */
export function firePluginListeners([plugin, eventName, payload]: readonly [string, string, unknown]): number {
	const listeners = window.__capMockListeners?.[plugin]?.[eventName] ?? [];
	listeners.forEach((listener) => listener(payload));
	return listeners.length;
}

function methodSource(method: string, value: unknown): string {
	if (typeof value !== 'function') {
		return `async () => (${JSON.stringify(value ?? null)})`;
	}
	const source = value.toString();
	// Arrow functions and `function` expressions can be used as-is; method
	// shorthand (`scan() { ... }`) has to be read back out of an object literal.
	const isExpression = /^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(source);
	return isExpression ? source : `({ ${source} })[${JSON.stringify(method)}]`;
}

declare global {
	interface Window {
		__capMocks?: Record<string, unknown>;
		__capMockListeners?: Record<string, Record<string, Array<(data: unknown) => void>>>;
	}
}
