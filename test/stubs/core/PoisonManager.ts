/**
 * PoisonManager - Handles error injection for testing error paths
 *
 * Usage:
 *   const manager = new PoisonManager<string>();
 *   manager.poison("update", new Error("Simulated failure"));
 *   manager.throwIfPoisoned("update"); // throws Error("Simulated failure")
 */

import type { IPoisonable } from "./interfaces";

export class PoisonManager<TKey = string> implements IPoisonable<TKey> {
	private readonly _poisons: Map<TKey, Error> = new Map();
	private readonly _defaultError: Error;

	constructor(defaultError?: Error) {
		this._defaultError = defaultError ?? new Error("Poisoned method called");
	}

	/**
	 * Mark a key as poisoned - will throw on access
	 */
	poison(key: TKey, error?: Error): void {
		this._poisons.set(key, error ?? this._defaultError);
	}

	/**
	 * Remove poison from a key
	 */
	cure(key: TKey): void {
		this._poisons.delete(key);
	}

	/**
	 * Check if a key is poisoned
	 */
	isPoisoned(key: TKey): boolean {
		return this._poisons.has(key);
	}

	/**
	 * Remove all poisons
	 */
	cureAll(): void {
		this._poisons.clear();
	}

	/**
	 * Throw if the key is poisoned, otherwise do nothing
	 * Call this at the start of methods that should be poisonable
	 */
	throwIfPoisoned(key: TKey): void {
		const error = this._poisons.get(key);
		if (error) {
			throw error;
		}
	}

	/**
	 * Get all poisoned keys
	 */
	getPoisonedKeys(): TKey[] {
		return Array.from(this._poisons.keys());
	}

	/**
	 * Get the error for a poisoned key
	 */
	getError(key: TKey): Error | undefined {
		return this._poisons.get(key);
	}
}
