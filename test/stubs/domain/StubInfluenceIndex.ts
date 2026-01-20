/**
 * StubInfluenceIndex - Stub for the influence tracking index
 *
 * Usage:
 *   const index = new StubInfluenceIndex();
 *   index.addMapping("Beacon", "char-001");
 *   const actorId = index.getActorId("Beacon"); // "char-001"
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import { StateManager } from "../core/StateManager";
import type { ITrackable, IRestorable, Invocation } from "../core/interfaces";

interface InfluenceIndexState {
	nameToId: Map<string, string>;
	idToName: Map<string, string>;
	normalizedNames: Map<string, string>; // normalized -> original
}

export class StubInfluenceIndex implements ITrackable, IRestorable<InfluenceIndexState> {
	private _recorder = new InvocationRecorder();
	private _stateManager: StateManager<InfluenceIndexState>;

	constructor() {
		this._stateManager = new StateManager<InfluenceIndexState>({
			nameToId: new Map(),
			idToName: new Map(),
			normalizedNames: new Map(),
		});
	}

	// ========================================================================
	// Index API
	// ========================================================================

	/**
	 * Get actor ID from name (uses fuzzy matching)
	 */
	getActorId(name: string): string | undefined {
		this._recorder.record("getActorId", [name]);
		const state = this._stateManager.getCurrentState();

		// Try exact match first
		if (state.nameToId.has(name)) {
			return state.nameToId.get(name);
		}

		// Try normalized match
		const normalized = this.normalize(name);
		const originalName = state.normalizedNames.get(normalized);
		if (originalName) {
			return state.nameToId.get(originalName);
		}

		return undefined;
	}

	/**
	 * Get actor name from ID
	 */
	getActorName(id: string): string | undefined {
		this._recorder.record("getActorName", [id]);
		return this._stateManager.getCurrentState().idToName.get(id);
	}

	/**
	 * Check if an actor is in the index
	 */
	hasActor(nameOrId: string): boolean {
		this._recorder.record("hasActor", [nameOrId]);
		const state = this._stateManager.getCurrentState();
		return state.nameToId.has(nameOrId) || state.idToName.has(nameOrId);
	}

	/**
	 * Get all indexed actor IDs
	 */
	getAllIds(): string[] {
		this._recorder.record("getAllIds", []);
		return Array.from(this._stateManager.getCurrentState().idToName.keys());
	}

	/**
	 * Get all indexed actor names
	 */
	getAllNames(): string[] {
		this._recorder.record("getAllNames", []);
		return Array.from(this._stateManager.getCurrentState().nameToId.keys());
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Add a name-to-ID mapping
	 */
	addMapping(name: string, id: string): this {
		const state = this._stateManager.getCurrentState();
		state.nameToId.set(name, id);
		state.idToName.set(id, name);
		state.normalizedNames.set(this.normalize(name), name);
		return this;
	}

	/**
	 * Remove a mapping by name or ID
	 */
	removeMapping(nameOrId: string): boolean {
		const state = this._stateManager.getCurrentState();

		// Try as name first
		const id = state.nameToId.get(nameOrId);
		if (id) {
			state.nameToId.delete(nameOrId);
			state.idToName.delete(id);
			state.normalizedNames.delete(this.normalize(nameOrId));
			return true;
		}

		// Try as ID
		const name = state.idToName.get(nameOrId);
		if (name) {
			state.idToName.delete(nameOrId);
			state.nameToId.delete(name);
			state.normalizedNames.delete(this.normalize(name));
			return true;
		}

		return false;
	}

	/**
	 * Clear all mappings
	 */
	clear(): void {
		const state = this._stateManager.getCurrentState();
		state.nameToId.clear();
		state.idToName.clear();
		state.normalizedNames.clear();
	}

	/**
	 * Normalize a name for fuzzy matching
	 * Mirrors the normalize function in influence.ts
	 */
	private normalize(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
			.trim();
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
	// IRestorable Implementation
	// ========================================================================

	save(): void {
		this._stateManager.save();
	}

	reset(): void {
		this._stateManager.reset();
	}

	resetToEmpty(): void {
		this._stateManager.resetToEmpty();
	}

	getCurrentState(): InfluenceIndexState {
		return this._stateManager.getCurrentState();
	}
}
