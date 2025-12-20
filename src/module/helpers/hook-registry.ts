/* global Hooks */

/**
 * hook-registry.ts
 * ----------------------------------------------------------------------------
 * Reusable utility class for managing Foundry hook lifecycle.
 *
 * Hooks registered via this class are tracked and can be unregistered all at
 * once when the component unmounts, preventing listener accumulation during
 * hot reloads or scene changes.
 *
 * Usage:
 *   const hooks = new HookRegistry();
 *   hooks.on("updateActor", myHandler);
 *   hooks.once("ready", myInitHandler);
 *   // Later, when unmounting:
 *   hooks.unregisterAll();
 */

export class HookRegistry {
	/** Map of hook entries: key is `${event}-${id}`, value is the hook ID */
	private _hooks: Map<string, number> = new Map();

	/** Track socket handlers for cleanup */
	private _socketHandlers: Map<string, (data: unknown) => void> = new Map();

	/**
	 * Register a persistent hook (Hooks.on)
	 * @param event - The hook event name
	 * @param fn - The callback function
	 * @returns The hook ID for manual unregistration if needed
	 */
	on(event: string, fn: (...args: unknown[]) => void): number {
		const id = Hooks.on(event, fn);
		this._hooks.set(`${event}-${id}`, id);
		return id;
	}

	/**
	 * Register a one-time hook (Hooks.once)
	 * Note: These auto-unregister after firing, but we track them anyway
	 * in case we need to unregister before they fire.
	 * @param event - The hook event name
	 * @param fn - The callback function
	 * @returns The hook ID for manual unregistration if needed
	 */
	once(event: string, fn: (...args: unknown[]) => void): number {
		const id = Hooks.once(event, fn);
		this._hooks.set(`${event}-${id}`, id);
		return id;
	}

	/**
	 * Manually unregister a specific hook by ID
	 * @param event - The hook event name
	 * @param id - The hook ID returned from on() or once()
	 */
	off(event: string, id: number): void {
		const key = `${event}-${id}`;
		if (this._hooks.has(key)) {
			Hooks.off(event, id);
			this._hooks.delete(key);
		}
	}

	/**
	 * Register a socket handler with cleanup tracking
	 * @param namespace - The socket namespace (e.g., "module.my-module")
	 * @param handler - The handler function
	 */
	onSocket(namespace: string, handler: (data: unknown) => void): void {
		// Remove existing handler for this namespace if present
		if (this._socketHandlers.has(namespace)) {
			const oldHandler = this._socketHandlers.get(namespace);
			if (oldHandler && game.socket) {
				game.socket.off(namespace, oldHandler);
			}
		}

		// Register new handler
		if (game.socket) {
			game.socket.on(namespace, handler);
			this._socketHandlers.set(namespace, handler);
		}
	}

	/**
	 * Unregister a specific socket handler
	 * @param namespace - The socket namespace
	 */
	offSocket(namespace: string): void {
		const handler = this._socketHandlers.get(namespace);
		if (handler && game.socket) {
			game.socket.off(namespace, handler);
			this._socketHandlers.delete(namespace);
		}
	}

	/**
	 * Unregister all tracked hooks and socket handlers
	 * Call this when unmounting/destroying the component
	 */
	unregisterAll(): void {
		// Unregister all hooks
		for (const [key, id] of this._hooks) {
			// Extract event name from key (format: "eventName-hookId")
			const dashIndex = key.lastIndexOf("-");
			if (dashIndex > 0) {
				const event = key.substring(0, dashIndex);
				Hooks.off(event, id);
			}
		}
		this._hooks.clear();

		// Unregister all socket handlers
		for (const [namespace, handler] of this._socketHandlers) {
			if (game.socket) {
				game.socket.off(namespace, handler);
			}
		}
		this._socketHandlers.clear();
	}

	/**
	 * Check if any hooks are currently registered
	 */
	get isEmpty(): boolean {
		return this._hooks.size === 0 && this._socketHandlers.size === 0;
	}

	/**
	 * Get the count of registered hooks (not including socket handlers)
	 */
	get hookCount(): number {
		return this._hooks.size;
	}

	/**
	 * Get the count of registered socket handlers
	 */
	get socketHandlerCount(): number {
		return this._socketHandlers.size;
	}
}
