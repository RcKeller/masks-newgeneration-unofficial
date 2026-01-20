/**
 * StateManager - Handles state snapshots for test isolation
 *
 * Usage:
 *   const manager = new StateManager<MyState>();
 *   manager.setState({ foo: "bar" });
 *   manager.save();
 *   manager.setState({ foo: "modified" });
 *   manager.reset(); // foo is back to "bar"
 */

import type { IRestorable } from "./interfaces";

export class StateManager<TState> implements IRestorable<TState> {
	private _currentState: TState;
	private _savedState: TState | null = null;
	private readonly _emptyState: TState;

	constructor(initialState: TState) {
		this._emptyState = this.deepClone(initialState);
		this._currentState = this.deepClone(initialState);
	}

	/**
	 * Get the current state
	 */
	getCurrentState(): TState {
		return this._currentState;
	}

	/**
	 * Set the current state
	 */
	setState(state: TState): void {
		this._currentState = this.deepClone(state);
	}

	/**
	 * Merge partial state into current state
	 */
	mergeState(partial: Partial<TState>): void {
		this._currentState = {
			...this._currentState,
			...this.deepClone(partial),
		};
	}

	/**
	 * Save current state as a snapshot
	 */
	save(): void {
		this._savedState = this.deepClone(this._currentState);
	}

	/**
	 * Reset to last saved snapshot (or empty if no save)
	 */
	reset(): void {
		if (this._savedState !== null) {
			this._currentState = this.deepClone(this._savedState);
		} else {
			this.resetToEmpty();
		}
	}

	/**
	 * Reset to empty/initial state
	 */
	resetToEmpty(): void {
		this._currentState = this.deepClone(this._emptyState);
		this._savedState = null;
	}

	/**
	 * Check if there's a saved snapshot
	 */
	hasSavedState(): boolean {
		return this._savedState !== null;
	}

	/**
	 * Get the saved state (for debugging)
	 */
	getSavedState(): TState | null {
		return this._savedState ? this.deepClone(this._savedState) : null;
	}

	/**
	 * Deep clone utility
	 */
	private deepClone<T>(obj: T): T {
		if (obj === null || typeof obj !== "object") return obj;
		if (Array.isArray(obj)) return obj.map((item) => this.deepClone(item)) as unknown as T;
		if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
		if (obj instanceof Map) return new Map(Array.from(obj.entries()).map(([k, v]) => [k, this.deepClone(v)])) as unknown as T;
		if (obj instanceof Set) return new Set(Array.from(obj).map((v) => this.deepClone(v))) as unknown as T;

		const result: Record<string, unknown> = {};
		for (const key of Object.keys(obj as Record<string, unknown>)) {
			result[key] = this.deepClone((obj as Record<string, unknown>)[key]);
		}
		return result as T;
	}
}
