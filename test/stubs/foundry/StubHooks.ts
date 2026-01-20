/**
 * StubHooks - Stub for FoundryVTT's Hooks global
 *
 * Usage:
 *   const hooks = new StubHooks();
 *   globalThis.Hooks = hooks;
 *
 *   // In code under test:
 *   Hooks.on("ready", () => console.log("Ready!"));
 *
 *   // In test:
 *   hooks.callAll("ready"); // Triggers registered callbacks
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import type { ITrackable, Invocation } from "../core/interfaces";

type HookCallback = (...args: unknown[]) => unknown;

interface HookRegistration {
	id: number;
	callback: HookCallback;
	once: boolean;
}

export class StubHooks implements ITrackable {
	private _recorder = new InvocationRecorder();
	private _hooks: Map<string, HookRegistration[]> = new Map();
	private _nextId = 1;

	/**
	 * Register a callback for a hook
	 */
	on(name: string, callback: HookCallback): number {
		this._recorder.record("on", [name, callback]);
		return this._register(name, callback, false);
	}

	/**
	 * Register a one-time callback for a hook
	 */
	once(name: string, callback: HookCallback): number {
		this._recorder.record("once", [name, callback]);
		return this._register(name, callback, true);
	}

	/**
	 * Unregister a callback
	 */
	off(name: string, idOrCallback: number | HookCallback): void {
		this._recorder.record("off", [name, idOrCallback]);
		const hooks = this._hooks.get(name);
		if (!hooks) return;

		const index =
			typeof idOrCallback === "number"
				? hooks.findIndex((h) => h.id === idOrCallback)
				: hooks.findIndex((h) => h.callback === idOrCallback);

		if (index >= 0) {
			hooks.splice(index, 1);
		}
	}

	/**
	 * Call all registered callbacks for a hook
	 * Callbacks can return false to stop propagation (for call, not callAll)
	 */
	call(name: string, ...args: unknown[]): boolean {
		this._recorder.record("call", [name, ...args]);
		const hooks = this._hooks.get(name);
		if (!hooks || hooks.length === 0) return true;

		const toRemove: number[] = [];

		for (const hook of hooks) {
			const result = hook.callback(...args);
			if (hook.once) {
				toRemove.push(hook.id);
			}
			if (result === false) {
				// Remove one-time hooks even if propagation stopped
				this._removeHooks(name, toRemove);
				return false;
			}
		}

		this._removeHooks(name, toRemove);
		return true;
	}

	/**
	 * Call all registered callbacks without stopping on false
	 */
	callAll(name: string, ...args: unknown[]): boolean {
		this._recorder.record("callAll", [name, ...args]);
		const hooks = this._hooks.get(name);
		if (!hooks || hooks.length === 0) return true;

		const toRemove: number[] = [];

		for (const hook of hooks) {
			hook.callback(...args);
			if (hook.once) {
				toRemove.push(hook.id);
			}
		}

		this._removeHooks(name, toRemove);
		return true;
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Get all registered hook names
	 */
	getRegisteredHooks(): string[] {
		return Array.from(this._hooks.keys());
	}

	/**
	 * Get count of callbacks registered for a hook
	 */
	getCallbackCount(name: string): number {
		return this._hooks.get(name)?.length ?? 0;
	}

	/**
	 * Check if a hook has any callbacks
	 */
	hasCallbacks(name: string): boolean {
		return this.getCallbackCount(name) > 0;
	}

	/**
	 * Clear all registered hooks
	 */
	clearAll(): void {
		this._hooks.clear();
		this._nextId = 1;
	}

	/**
	 * Clear hooks for a specific event
	 */
	clear(name: string): void {
		this._hooks.delete(name);
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	private _register(name: string, callback: HookCallback, once: boolean): number {
		const id = this._nextId++;
		const hooks = this._hooks.get(name) ?? [];
		hooks.push({ id, callback, once });
		this._hooks.set(name, hooks);
		return id;
	}

	private _removeHooks(name: string, ids: number[]): void {
		if (ids.length === 0) return;
		const hooks = this._hooks.get(name);
		if (!hooks) return;

		const idSet = new Set(ids);
		const remaining = hooks.filter((h) => !idSet.has(h.id));
		this._hooks.set(name, remaining);
	}

	// ========================================================================
	// ITrackable Implementation
	// ========================================================================

	get invocations(): readonly Invocation[] {
		return this._recorder.invocations;
	}

	getInvocationsFor(method: string): readonly Invocation[] {
		return this._recorder.getInvocationsFor(method);
	}

	clearInvocations(): void {
		this._recorder.clearInvocations();
	}

	wasCalled(method: string): boolean {
		return this._recorder.wasCalled(method);
	}

	callCount(method: string): number {
		return this._recorder.callCount(method);
	}

	getLastInvocation(method: string): Invocation | undefined {
		return this._recorder.getLastInvocation(method);
	}
}
