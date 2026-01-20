/**
 * StubActorCollection - Stub for FoundryVTT's game.actors collection
 *
 * Usage:
 *   const actors = new StubActorCollection();
 *   actors.add(StubActor.forCharacter({ name: "Beacon" }));
 *   game.actors = actors;
 *
 *   // In code under test:
 *   const actor = game.actors.get("char-001");
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import { StateManager } from "../core/StateManager";
import type { ITrackable, IRestorable, Invocation } from "../core/interfaces";
import { StubActor } from "../foundry/StubActor";

interface CollectionState {
	actors: StubActor[];
}

export class StubActorCollection implements ITrackable, IRestorable<CollectionState> {
	private _recorder = new InvocationRecorder();
	private _stateManager: StateManager<CollectionState>;

	constructor() {
		this._stateManager = new StateManager<CollectionState>({ actors: [] });
	}

	// ========================================================================
	// Collection API (mimics FoundryVTT WorldCollection)
	// ========================================================================

	/**
	 * Get array of all actors
	 */
	get contents(): StubActor[] {
		return [...this._stateManager.getCurrentState().actors];
	}

	/**
	 * Get number of actors
	 */
	get size(): number {
		return this._stateManager.getCurrentState().actors.length;
	}

	/**
	 * Get an actor by ID
	 */
	get(id: string): StubActor | undefined {
		this._recorder.record("get", [id]);
		return this._stateManager.getCurrentState().actors.find((a) => a.id === id);
	}

	/**
	 * Get an actor by name
	 */
	getName(name: string): StubActor | undefined {
		this._recorder.record("getName", [name]);
		return this._stateManager.getCurrentState().actors.find((a) => a.name === name);
	}

	/**
	 * Check if an actor exists
	 */
	has(id: string): boolean {
		this._recorder.record("has", [id]);
		return this._stateManager.getCurrentState().actors.some((a) => a.id === id);
	}

	/**
	 * Filter actors
	 */
	filter(predicate: (actor: StubActor) => boolean): StubActor[] {
		this._recorder.record("filter", [predicate]);
		return this._stateManager.getCurrentState().actors.filter(predicate);
	}

	/**
	 * Find an actor
	 */
	find(predicate: (actor: StubActor) => boolean): StubActor | undefined {
		this._recorder.record("find", [predicate]);
		return this._stateManager.getCurrentState().actors.find(predicate);
	}

	/**
	 * Map actors
	 */
	map<T>(fn: (actor: StubActor) => T): T[] {
		this._recorder.record("map", [fn]);
		return this._stateManager.getCurrentState().actors.map(fn);
	}

	/**
	 * Iterate over actors
	 */
	forEach(fn: (actor: StubActor) => void): void {
		this._recorder.record("forEach", [fn]);
		this._stateManager.getCurrentState().actors.forEach(fn);
	}

	/**
	 * Check if any actor matches
	 */
	some(predicate: (actor: StubActor) => boolean): boolean {
		this._recorder.record("some", [predicate]);
		return this._stateManager.getCurrentState().actors.some(predicate);
	}

	/**
	 * Check if all actors match
	 */
	every(predicate: (actor: StubActor) => boolean): boolean {
		this._recorder.record("every", [predicate]);
		return this._stateManager.getCurrentState().actors.every(predicate);
	}

	/**
	 * Iterator support
	 */
	[Symbol.iterator](): Iterator<StubActor> {
		return this._stateManager.getCurrentState().actors[Symbol.iterator]();
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Add an actor to the collection
	 */
	add(actor: StubActor): this {
		const state = this._stateManager.getCurrentState();
		// Avoid duplicates by ID
		const existing = state.actors.findIndex((a) => a.id === actor.id);
		if (existing >= 0) {
			state.actors[existing] = actor;
		} else {
			state.actors.push(actor);
		}
		return this;
	}

	/**
	 * Add multiple actors
	 */
	addAll(actors: StubActor[]): this {
		for (const actor of actors) {
			this.add(actor);
		}
		return this;
	}

	/**
	 * Remove an actor by ID
	 */
	remove(id: string): boolean {
		const state = this._stateManager.getCurrentState();
		const index = state.actors.findIndex((a) => a.id === id);
		if (index >= 0) {
			state.actors.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Clear all actors
	 */
	clear(): void {
		this._stateManager.getCurrentState().actors = [];
	}

	/**
	 * Get all characters (type === "character")
	 */
	getCharacters(): StubActor[] {
		return this._stateManager.getCurrentState().actors.filter((a) => a.type === "character");
	}

	/**
	 * Get all NPCs (type === "npc")
	 */
	getNPCs(): StubActor[] {
		return this._stateManager.getCurrentState().actors.filter((a) => a.type === "npc");
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

	getCurrentState(): CollectionState {
		return this._stateManager.getCurrentState();
	}
}
