/**
 * Pre-built test characters for Masks tests
 *
 * These are constant character configurations for common test scenarios.
 * Use .clone() to get a modifiable copy for tests that modify state.
 *
 * Usage:
 *   import { BEACON, LEGACY, EDGE_CASE_CHARACTER } from "../test_data/TestCharacters";
 *
 *   it("should handle label shifts", () => {
 *     const actor = BEACON.clone();
 *     // ... test code
 *   });
 */

import { StubActor } from "../stubs/foundry/StubActor";

// ============================================================================
// Core Playbook Characters
// ============================================================================

/**
 * The Beacon - Classic young hero optimist
 * Starting labels: Danger +2, Freak 0, Savior +1, Superior -1, Mundane +1
 */
export const BEACON = StubActor.withLabels(
	{ danger: 2, freak: 0, savior: 1, superior: -1, mundane: 1 },
	{
		id: "char-beacon-001",
		name: "Beacon",
		system: {
			playbook: { name: "The Beacon" },
		} as any,
	},
);

/**
 * The Legacy - Carrying on a heroic tradition
 * Starting labels: Danger -1, Freak 0, Savior +2, Superior +1, Mundane +1
 */
export const LEGACY = StubActor.withLabels(
	{ danger: -1, freak: 0, savior: 2, superior: 1, mundane: 1 },
	{
		id: "char-legacy-001",
		name: "Legacy",
		system: {
			playbook: { name: "The Legacy" },
		} as any,
	},
);

/**
 * The Bull - Powerful and emotional
 * Starting labels: Danger +2, Freak +1, Savior -1, Superior -1, Mundane +2
 */
export const BULL = StubActor.withLabels(
	{ danger: 2, freak: 1, savior: -1, superior: -1, mundane: 2 },
	{
		id: "char-bull-001",
		name: "Bull",
		system: {
			playbook: { name: "The Bull" },
		} as any,
	},
);

/**
 * The Nova - Dangerous powers barely under control
 * Starting labels: Danger +1, Freak +2, Savior 0, Superior +1, Mundane -1
 */
export const NOVA = StubActor.withLabels(
	{ danger: 1, freak: 2, savior: 0, superior: 1, mundane: -1 },
	{
		id: "char-nova-001",
		name: "Nova",
		system: {
			playbook: { name: "The Nova" },
		} as any,
	},
);

/**
 * The Doomed - Fated for destruction
 * Starting labels: Danger +1, Freak +1, Savior +1, Superior -1, Mundane +1
 */
export const DOOMED = StubActor.withLabels(
	{ danger: 1, freak: 1, savior: 1, superior: -1, mundane: 1 },
	{
		id: "char-doomed-001",
		name: "Doomed",
		system: {
			playbook: { name: "The Doomed" },
		} as any,
	},
);

/**
 * The Soldier - Military background with 6th label
 * Starting labels: Danger +2, Freak 0, Savior +1, Superior +1, Mundane -1, Soldier +1
 */
export const SOLDIER = StubActor.withPlaybook("The Soldier", {
	id: "char-soldier-001",
	name: "Soldier",
}).setLabel("danger", 2)
  .setLabel("freak", 0)
  .setLabel("savior", 1)
  .setLabel("superior", 1)
  .setLabel("mundane", -1)
  .setLabel("soldier", 1);

// ============================================================================
// Edge Case Characters
// ============================================================================

/**
 * Character at label bounds - for edge case testing
 * Danger at max (+3), Freak at min (-2)
 */
export const EDGE_CASE_MAX_DANGER = StubActor.withLabels(
	{ danger: 3, freak: -2, savior: 0, superior: 0, mundane: 0 },
	{
		id: "char-edge-max-danger",
		name: "Edge Case (Max Danger)",
	},
);

/**
 * Character with all labels at maximum (+3)
 */
export const ALL_MAX_LABELS = StubActor.withLabels(
	{ danger: 3, freak: 3, savior: 3, superior: 3, mundane: 3 },
	{
		id: "char-all-max",
		name: "All Max Labels",
	},
);

/**
 * Character with all labels at minimum (-2)
 */
export const ALL_MIN_LABELS = StubActor.withLabels(
	{ danger: -2, freak: -2, savior: -2, superior: -2, mundane: -2 },
	{
		id: "char-all-min",
		name: "All Min Labels",
	},
);

/**
 * Character with all conditions marked
 */
export const ALL_CONDITIONS_MARKED = StubActor.forCharacter({
	id: "char-all-conditions",
	name: "All Conditions Marked",
})
	.setCondition("afraid", true)
	.setCondition("angry", true)
	.setCondition("guilty", true)
	.setCondition("hopeless", true)
	.setCondition("insecure", true);

/**
 * Character with locked labels
 */
export const LOCKED_LABELS_CHARACTER = StubActor.withLabels(
	{ danger: 0, freak: 0, savior: 0, superior: 0, mundane: 0 },
	{
		id: "char-locked",
		name: "Locked Labels Character",
	},
).setLockedLabels({
	danger: true,
	savior: true,
});

// ============================================================================
// NPCs / Villains
// ============================================================================

/**
 * Siphon - Classic tier-5 villain
 */
export const SIPHON = StubActor.forNPC({
	id: "npc-siphon-001",
	name: "Siphon",
	system: {
		stats: {
			danger: { value: 2, label: "Danger" },
			freak: { value: 1, label: "Freak" },
			savior: { value: -1, label: "Savior" },
			superior: { value: 2, label: "Superior" },
			mundane: { value: -2, label: "Mundane" },
		},
		attributes: {
			conditions: {
				options: {
					0: { value: false },
					1: { value: false },
					2: { value: false },
					3: { value: false },
					4: { value: false },
				},
			},
			hp: { value: 5, max: 5 },
			xp: { value: 0 },
			tier: { value: 5 },
		},
		resources: {
			forward: { value: 0 },
			ongoing: { value: 0 },
		},
		playbook: { name: "" },
	},
});

/**
 * Minor villain - lower tier
 */
export const MINOR_VILLAIN = StubActor.forNPC({
	id: "npc-minor-001",
	name: "Minor Threat",
	system: {
		stats: {
			danger: { value: 1, label: "Danger" },
			freak: { value: 0, label: "Freak" },
			savior: { value: 0, label: "Savior" },
			superior: { value: 0, label: "Superior" },
			mundane: { value: 0, label: "Mundane" },
		},
		attributes: {
			conditions: {
				options: {
					0: { value: false },
					1: { value: false },
					2: { value: false },
					3: { value: false },
					4: { value: false },
				},
			},
			hp: { value: 3, max: 3 },
			xp: { value: 0 },
			tier: { value: 2 },
		},
		resources: {
			forward: { value: 0 },
			ongoing: { value: 0 },
		},
		playbook: { name: "" },
	},
});

// ============================================================================
// Influence Test Scenarios
// ============================================================================

/**
 * Character with influences set up
 */
export const CHARACTER_WITH_INFLUENCES = StubActor.forCharacter({
	id: "char-influence-001",
	name: "Influencer",
}).setInfluences([
	{ id: "char-beacon-001", name: "Beacon", hasInfluenceOver: true, haveInfluenceOver: false },
	{ id: "char-legacy-001", name: "Legacy", hasInfluenceOver: false, haveInfluenceOver: true },
	{ id: "npc-siphon-001", name: "Siphon", hasInfluenceOver: true, haveInfluenceOver: true },
]);

/**
 * Character with mutual influence
 */
export const MUTUAL_INFLUENCE_CHARACTER = StubActor.forCharacter({
	id: "char-mutual-001",
	name: "Mutual Influence",
}).setInfluences([
	{ id: "char-beacon-001", name: "Beacon", hasInfluenceOver: true, haveInfluenceOver: true },
]);

// ============================================================================
// Test Scenario Presets
// ============================================================================

/**
 * Standard test scenario with 2 PCs and 1 villain
 */
export function createStandardScenario(): {
	pc1: StubActor;
	pc2: StubActor;
	villain: StubActor;
} {
	return {
		pc1: BEACON.clone(),
		pc2: LEGACY.clone(),
		villain: SIPHON.clone(),
	};
}

/**
 * Full party scenario with 4 PCs
 */
export function createFullParty(): StubActor[] {
	return [BEACON.clone(), LEGACY.clone(), BULL.clone(), NOVA.clone()];
}

/**
 * Influence test scenario
 */
export function createInfluenceScenario(): {
	source: StubActor;
	targets: StubActor[];
} {
	return {
		source: CHARACTER_WITH_INFLUENCES.clone(),
		targets: [BEACON.clone(), LEGACY.clone(), SIPHON.clone()],
	};
}
