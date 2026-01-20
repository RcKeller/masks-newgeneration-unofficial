/**
 * StubSettings - Stub for FoundryVTT's game.settings
 *
 * Usage:
 *   const settings = new StubSettings();
 *   settings.set("masks-newgeneration-unofficial", "darkMode", true);
 *   game.settings = settings;
 *
 *   // In code under test:
 *   const darkMode = game.settings.get("masks-newgeneration-unofficial", "darkMode");
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import { PoisonManager } from "../core/PoisonManager";
import type { ITrackable, IPoisonable, Invocation } from "../core/interfaces";

export interface SettingConfig {
	name?: string;
	hint?: string;
	scope?: "world" | "client";
	config?: boolean;
	type?: unknown;
	default?: unknown;
	choices?: Record<string, string>;
	range?: { min: number; max: number; step: number };
	onChange?: (value: unknown) => void;
}

export class StubSettings implements ITrackable, IPoisonable<string> {
	private _recorder = new InvocationRecorder();
	private _poison = new PoisonManager<string>();
	private _settings: Map<string, unknown> = new Map();
	private _registrations: Map<string, SettingConfig> = new Map();

	/**
	 * Get a setting value
	 */
	get(namespace: string, key: string): unknown {
		const fullKey = `${namespace}.${key}`;
		this._recorder.record("get", [namespace, key]);
		this._poison.throwIfPoisoned(fullKey);

		if (this._settings.has(fullKey)) {
			return this._settings.get(fullKey);
		}

		// Return default from registration if available
		const registration = this._registrations.get(fullKey);
		if (registration?.default !== undefined) {
			return registration.default;
		}

		return undefined;
	}

	/**
	 * Set a setting value
	 */
	async set(namespace: string, key: string, value: unknown): Promise<unknown> {
		const fullKey = `${namespace}.${key}`;
		this._recorder.record("set", [namespace, key, value]);
		this._poison.throwIfPoisoned(fullKey);

		const registration = this._registrations.get(fullKey);
		this._settings.set(fullKey, value);

		// Call onChange handler if registered
		if (registration?.onChange) {
			registration.onChange(value);
		}

		return value;
	}

	/**
	 * Register a setting
	 */
	register(namespace: string, key: string, config: SettingConfig): void {
		const fullKey = `${namespace}.${key}`;
		this._recorder.record("register", [namespace, key, config]);
		this._registrations.set(fullKey, config);

		// Initialize with default if not already set
		if (!this._settings.has(fullKey) && config.default !== undefined) {
			this._settings.set(fullKey, config.default);
		}
	}

	/**
	 * Register a settings menu
	 */
	registerMenu(namespace: string, key: string, config: unknown): void {
		this._recorder.record("registerMenu", [namespace, key, config]);
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Check if a setting has been registered
	 */
	isRegistered(namespace: string, key: string): boolean {
		return this._registrations.has(`${namespace}.${key}`);
	}

	/**
	 * Get registration config for a setting
	 */
	getRegistration(namespace: string, key: string): SettingConfig | undefined {
		return this._registrations.get(`${namespace}.${key}`);
	}

	/**
	 * Clear all settings and registrations
	 */
	clearAll(): void {
		this._settings.clear();
		this._registrations.clear();
	}

	/**
	 * Directly set a value without recording or validation
	 */
	setDirect(namespace: string, key: string, value: unknown): void {
		this._settings.set(`${namespace}.${key}`, value);
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

	// ========================================================================
	// IPoisonable Implementation
	// ========================================================================

	poison(key: string, error?: Error): void {
		this._poison.poison(key, error);
	}

	cure(key: string): void {
		this._poison.cure(key);
	}

	isPoisoned(key: string): boolean {
		return this._poison.isPoisoned(key);
	}

	cureAll(): void {
		this._poison.cureAll();
	}
}
