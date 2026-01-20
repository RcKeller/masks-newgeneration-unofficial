/**
 * StubLocalizationService - Stub for FoundryVTT's game.i18n
 *
 * Usage:
 *   const i18n = new StubLocalizationService();
 *   i18n.addTranslation("MASKS.Labels.Danger", "Danger");
 *   game.i18n = i18n;
 *
 *   // Default behavior returns the key itself
 *   game.i18n.localize("UNKNOWN.Key"); // Returns "UNKNOWN.Key"
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import type { ITrackable, Invocation } from "../core/interfaces";

export class StubLocalizationService implements ITrackable {
	private _recorder = new InvocationRecorder();
	private _translations: Map<string, string> = new Map();
	private _returnKeys = true; // If true, returns key when translation not found

	/**
	 * Localize a string using the registered translations
	 */
	localize(key: string): string {
		this._recorder.record("localize", [key]);
		const translation = this._translations.get(key);
		if (translation !== undefined) {
			return translation;
		}
		return this._returnKeys ? key : "";
	}

	/**
	 * Format a localized string with substitutions
	 */
	format(key: string, data?: Record<string, unknown>): string {
		this._recorder.record("format", [key, data]);
		let result = this.localize(key);
		if (data) {
			for (const [k, v] of Object.entries(data)) {
				result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
			}
		}
		return result;
	}

	/**
	 * Check if a translation key exists
	 */
	has(key: string): boolean {
		this._recorder.record("has", [key]);
		return this._translations.has(key);
	}

	// ========================================================================
	// Test Configuration
	// ========================================================================

	/**
	 * Add a translation
	 */
	addTranslation(key: string, value: string): this {
		this._translations.set(key, value);
		return this;
	}

	/**
	 * Add multiple translations
	 */
	addTranslations(translations: Record<string, string>): this {
		for (const [key, value] of Object.entries(translations)) {
			this._translations.set(key, value);
		}
		return this;
	}

	/**
	 * Clear all translations
	 */
	clearTranslations(): void {
		this._translations.clear();
	}

	/**
	 * Set whether to return keys for missing translations
	 */
	setReturnKeys(returnKeys: boolean): this {
		this._returnKeys = returnKeys;
		return this;
	}

	/**
	 * Load standard Masks translations
	 */
	loadMasksTranslations(): this {
		return this.addTranslations({
			"DISPATCH.Labels.Danger": "Danger",
			"DISPATCH.Labels.Freak": "Freak",
			"DISPATCH.Labels.Savior": "Savior",
			"DISPATCH.Labels.Superior": "Superior",
			"DISPATCH.Labels.Mundane": "Mundane",
			"DISPATCH.Labels.Soldier": "Soldier",
			"DISPATCH.Conditions.Afraid": "Afraid",
			"DISPATCH.Conditions.Angry": "Angry",
			"DISPATCH.Conditions.Guilty": "Guilty",
			"DISPATCH.Conditions.Hopeless": "Hopeless",
			"DISPATCH.Conditions.Insecure": "Insecure",
		});
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
