/**
 * StubActor - Full-featured stub for FoundryVTT Actor documents
 *
 * Usage:
 *   const actor = StubActor.forCharacter({ name: "Beacon" });
 *   actor.poison("update"); // Inject error for testing error paths
 *   actor.save();
 *   // ... make changes ...
 *   actor.reset(); // Restore to saved state
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import { StateManager } from "../core/StateManager";
import { PoisonManager } from "../core/PoisonManager";
import type { IFullStub, Invocation } from "../core/interfaces";

export interface ActorSystemData {
	stats: {
		danger: { value: number; label?: string };
		freak: { value: number; label?: string };
		savior: { value: number; label?: string };
		superior: { value: number; label?: string };
		mundane: { value: number; label?: string };
	};
	attributes: {
		conditions: {
			options: Record<number, { value: boolean }>;
		};
		hp: { value: number; max: number };
		xp: { value: number };
		realName?: { value: string };
		theSoldier?: { value: number };
	};
	resources: {
		forward: { value: number };
		ongoing: { value: number };
	};
	playbook: { name: string };
}

export interface ActorState {
	id: string;
	name: string;
	type: "character" | "npc";
	system: ActorSystemData;
	flags: Record<string, Record<string, unknown>>;
}

const DEFAULT_CHARACTER_SYSTEM: ActorSystemData = {
	stats: {
		danger: { value: 0, label: "Danger" },
		freak: { value: 0, label: "Freak" },
		savior: { value: 0, label: "Savior" },
		superior: { value: 0, label: "Superior" },
		mundane: { value: 0, label: "Mundane" },
	},
	attributes: {
		conditions: {
			options: {
				0: { value: false }, // Afraid
				1: { value: false }, // Angry
				2: { value: false }, // Guilty
				3: { value: false }, // Hopeless
				4: { value: false }, // Insecure
			},
		},
		hp: { value: 5, max: 5 },
		xp: { value: 0 },
		realName: { value: "" },
	},
	resources: {
		forward: { value: 0 },
		ongoing: { value: 0 },
	},
	playbook: { name: "" },
};

export class StubActor implements IFullStub<ActorState, string> {
	private _recorder = new InvocationRecorder();
	private _stateManager: StateManager<ActorState>;
	private _poison = new PoisonManager<string>();

	private constructor(initialState: ActorState) {
		this._stateManager = new StateManager<ActorState>(initialState);
	}

	// ========================================================================
	// Factory Methods
	// ========================================================================

	/**
	 * Create a character actor (PC)
	 */
	static forCharacter(overrides: Partial<ActorState> = {}): StubActor {
		const state: ActorState = {
			id: overrides.id ?? `char-${Math.random().toString(36).slice(2, 10)}`,
			name: overrides.name ?? "Test Character",
			type: "character",
			system: StubActor.mergeDeep(DEFAULT_CHARACTER_SYSTEM, overrides.system ?? {}) as ActorSystemData,
			flags: overrides.flags ?? {},
		};
		return new StubActor(state);
	}

	/**
	 * Create an NPC actor
	 */
	static forNPC(overrides: Partial<ActorState> = {}): StubActor {
		const npcSystem = StubActor.mergeDeep(DEFAULT_CHARACTER_SYSTEM, {
			stats: {
				danger: { value: 2 },
				freak: { value: 1 },
				savior: { value: -1 },
				superior: { value: 0 },
				mundane: { value: -1 },
			},
			attributes: {
				...DEFAULT_CHARACTER_SYSTEM.attributes,
				tier: { value: 5 },
			},
		}) as ActorSystemData;

		const state: ActorState = {
			id: overrides.id ?? `npc-${Math.random().toString(36).slice(2, 10)}`,
			name: overrides.name ?? "Test NPC",
			type: "npc",
			system: StubActor.mergeDeep(npcSystem, overrides.system ?? {}) as ActorSystemData,
			flags: overrides.flags ?? {},
		};
		return new StubActor(state);
	}

	/**
	 * Create a character with specific label values
	 */
	static withLabels(
		labels: Partial<Record<"danger" | "freak" | "savior" | "superior" | "mundane", number>>,
		overrides: Partial<ActorState> = {},
	): StubActor {
		const systemOverrides = {
			stats: {
				danger: { value: labels.danger ?? 0 },
				freak: { value: labels.freak ?? 0 },
				savior: { value: labels.savior ?? 0 },
				superior: { value: labels.superior ?? 0 },
				mundane: { value: labels.mundane ?? 0 },
			},
		};
		return StubActor.forCharacter({
			...overrides,
			system: StubActor.mergeDeep(overrides.system ?? {}, systemOverrides) as ActorSystemData,
		});
	}

	/**
	 * Create a character with a specific playbook
	 */
	static withPlaybook(playbookName: string, overrides: Partial<ActorState> = {}): StubActor {
		const systemOverrides: Partial<ActorSystemData> = {
			playbook: { name: playbookName },
		};

		// The Soldier has a 6th label
		if (playbookName === "The Soldier") {
			systemOverrides.attributes = {
				...DEFAULT_CHARACTER_SYSTEM.attributes,
				theSoldier: { value: 0 },
			};
		}

		return StubActor.forCharacter({
			...overrides,
			system: StubActor.mergeDeep(overrides.system ?? {}, systemOverrides) as ActorSystemData,
		});
	}

	// ========================================================================
	// Actor API (mimics FoundryVTT Actor)
	// ========================================================================

	get id(): string {
		return this._stateManager.getCurrentState().id;
	}

	get name(): string {
		return this._stateManager.getCurrentState().name;
	}

	get type(): "character" | "npc" {
		return this._stateManager.getCurrentState().type;
	}

	get system(): ActorSystemData {
		return this._stateManager.getCurrentState().system;
	}

	get flags(): Record<string, Record<string, unknown>> {
		return this._stateManager.getCurrentState().flags;
	}

	/**
	 * Get a flag value
	 */
	getFlag(namespace: string, key: string): unknown {
		this._recorder.record("getFlag", [namespace, key]);
		this._poison.throwIfPoisoned("getFlag");

		const nsFlags = this.flags[namespace];
		return nsFlags?.[key];
	}

	/**
	 * Set a flag value
	 */
	async setFlag(namespace: string, key: string, value: unknown): Promise<this> {
		this._recorder.record("setFlag", [namespace, key, value]);
		this._poison.throwIfPoisoned("setFlag");

		const state = this._stateManager.getCurrentState();
		if (!state.flags[namespace]) {
			state.flags[namespace] = {};
		}
		state.flags[namespace][key] = value;
		return this;
	}

	/**
	 * Unset a flag
	 */
	async unsetFlag(namespace: string, key: string): Promise<this> {
		this._recorder.record("unsetFlag", [namespace, key]);
		this._poison.throwIfPoisoned("unsetFlag");

		const state = this._stateManager.getCurrentState();
		if (state.flags[namespace]) {
			delete state.flags[namespace][key];
		}
		return this;
	}

	/**
	 * Update the actor with new data
	 */
	async update(data: Record<string, unknown>): Promise<this> {
		this._recorder.record("update", [data]);
		this._poison.throwIfPoisoned("update");

		const state = this._stateManager.getCurrentState();

		// Process dot-notation paths
		for (const [path, value] of Object.entries(data)) {
			StubActor.setByPath(state, path, value);
		}

		return this;
	}

	/**
	 * Get data from the actor (for compatibility)
	 */
	getRollData(): Record<string, unknown> {
		this._recorder.record("getRollData", []);
		return {
			...this.system,
		};
	}

	/**
	 * Clone the actor (returns a new StubActor with the same state)
	 */
	clone(): StubActor {
		this._recorder.record("clone", []);
		const state = this._stateManager.getCurrentState();
		return new StubActor(StubActor.mergeDeep({}, state) as ActorState);
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Set a label value directly
	 */
	setLabel(label: "danger" | "freak" | "savior" | "superior" | "mundane" | "soldier", value: number): this {
		const state = this._stateManager.getCurrentState();
		if (label === "soldier") {
			if (!state.system.attributes.theSoldier) {
				state.system.attributes.theSoldier = { value: 0 };
			}
			state.system.attributes.theSoldier.value = value;
		} else {
			state.system.stats[label].value = value;
		}
		return this;
	}

	/**
	 * Get a label value
	 */
	getLabel(label: "danger" | "freak" | "savior" | "superior" | "mundane" | "soldier"): number {
		const state = this._stateManager.getCurrentState();
		if (label === "soldier") {
			return state.system.attributes.theSoldier?.value ?? 0;
		}
		return state.system.stats[label].value;
	}

	/**
	 * Set a condition
	 */
	setCondition(condition: "afraid" | "angry" | "guilty" | "hopeless" | "insecure", marked: boolean): this {
		const conditionIndex = { afraid: 0, angry: 1, guilty: 2, hopeless: 3, insecure: 4 }[condition];
		const state = this._stateManager.getCurrentState();
		state.system.attributes.conditions.options[conditionIndex].value = marked;
		return this;
	}

	/**
	 * Set locked labels
	 */
	setLockedLabels(locked: Record<string, boolean>): this {
		const state = this._stateManager.getCurrentState();
		if (!state.flags["masks-newgeneration-unofficial"]) {
			state.flags["masks-newgeneration-unofficial"] = {};
		}
		state.flags["masks-newgeneration-unofficial"].lockedLabels = locked;
		return this;
	}

	/**
	 * Set influences
	 */
	setInfluences(
		influences: Array<{
			id?: string;
			name: string;
			hasInfluenceOver?: boolean;
			haveInfluenceOver?: boolean;
			locked?: boolean;
		}>,
	): this {
		const state = this._stateManager.getCurrentState();
		if (!state.flags["masks-newgeneration-unofficial"]) {
			state.flags["masks-newgeneration-unofficial"] = {};
		}
		state.flags["masks-newgeneration-unofficial"].influences = influences.map((inf) => ({
			id: inf.id ?? Math.random().toString(36).slice(2),
			name: inf.name,
			hasInfluenceOver: inf.hasInfluenceOver ?? false,
			haveInfluenceOver: inf.haveInfluenceOver ?? false,
			locked: inf.locked ?? false,
		}));
		return this;
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

	getCurrentState(): ActorState {
		return this._stateManager.getCurrentState();
	}

	// ========================================================================
	// Utility Methods
	// ========================================================================

	private static setByPath(obj: unknown, path: string, value: unknown): void {
		const parts = path.split(".");
		let current = obj as Record<string, unknown>;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!(part in current) || typeof current[part] !== "object") {
				current[part] = {};
			}
			current = current[part] as Record<string, unknown>;
		}

		current[parts[parts.length - 1]] = value;
	}

	private static mergeDeep(target: unknown, source: unknown): unknown {
		if (source === null || typeof source !== "object") return source;
		if (target === null || typeof target !== "object") return StubActor.mergeDeep({}, source);

		const result = Array.isArray(target) ? [...target] : { ...(target as Record<string, unknown>) };

		for (const key of Object.keys(source as Record<string, unknown>)) {
			const sourceValue = (source as Record<string, unknown>)[key];
			const targetValue = (result as Record<string, unknown>)[key];

			if (sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue)) {
				(result as Record<string, unknown>)[key] = StubActor.mergeDeep(targetValue, sourceValue);
			} else {
				(result as Record<string, unknown>)[key] = sourceValue;
			}
		}

		return result;
	}
}
