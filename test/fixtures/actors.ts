/**
 * Test Actor Fixtures
 * Factory functions for creating test actors with various configurations
 */

import { createMockActor, type MockActorData } from "../__mocks__/foundry";

// ============================================================================
// Character Factories
// ============================================================================

/**
 * Create a basic Masks character with default stats
 */
export function createBasicCharacter(overrides: Partial<MockActorData> = {}): MockActorData {
	return createMockActor({
		name: "Test Hero",
		type: "character",
		...overrides,
	});
}

/**
 * Create a character with specific label values
 */
export function createCharacterWithLabels(
	labels: { danger?: number; freak?: number; savior?: number; superior?: number; mundane?: number },
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	const stats = actor.system.stats as Record<string, { value: number; label: string }>;

	if (labels.danger !== undefined) stats.danger.value = labels.danger;
	if (labels.freak !== undefined) stats.freak.value = labels.freak;
	if (labels.savior !== undefined) stats.savior.value = labels.savior;
	if (labels.superior !== undefined) stats.superior.value = labels.superior;
	if (labels.mundane !== undefined) stats.mundane.value = labels.mundane;

	return actor;
}

/**
 * Create a character with active conditions
 */
export function createCharacterWithConditions(
	conditions: { afraid?: boolean; angry?: boolean; guilty?: boolean; hopeless?: boolean; insecure?: boolean },
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	const opts = (actor.system.attributes as Record<string, unknown>).conditions as { options: Record<number, { value: boolean }> };

	if (conditions.afraid !== undefined) opts.options[0].value = conditions.afraid;
	if (conditions.angry !== undefined) opts.options[1].value = conditions.angry;
	if (conditions.guilty !== undefined) opts.options[2].value = conditions.guilty;
	if (conditions.hopeless !== undefined) opts.options[3].value = conditions.hopeless;
	if (conditions.insecure !== undefined) opts.options[4].value = conditions.insecure;

	return actor;
}

/**
 * Create a character with forward/ongoing bonuses
 */
export function createCharacterWithBonuses(
	forward: number = 0,
	ongoing: number = 0,
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	const resources = actor.system.resources as Record<string, { value: number }>;
	resources.forward.value = forward;
	resources.ongoing.value = ongoing;
	return actor;
}

/**
 * Create a character with a specific playbook
 */
export function createCharacterWithPlaybook(
	playbookName: string,
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	(actor.system.playbook as { name: string }).name = playbookName;

	// Add Soldier-specific attribute if needed
	if (playbookName === "The Soldier") {
		(actor.system.attributes as Record<string, unknown>).theSoldier = { value: 0 };
	}

	return actor;
}

/**
 * Create a character with influences
 */
export function createCharacterWithInfluences(
	influences: Array<{
		id?: string;
		name: string;
		hasInfluenceOver?: boolean;
		haveInfluenceOver?: boolean;
		locked?: boolean;
	}>,
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	actor.flags["masks-newgeneration-unofficial"] = {
		influences: influences.map((inf) => ({
			id: inf.id ?? Math.random().toString(36).slice(2),
			name: inf.name,
			hasInfluenceOver: inf.hasInfluenceOver ?? false,
			haveInfluenceOver: inf.haveInfluenceOver ?? false,
			locked: inf.locked ?? false,
		})),
	};
	return actor;
}

/**
 * Create a character with locked labels
 */
export function createCharacterWithLockedLabels(
	lockedLabels: Record<string, boolean>,
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const actor = createBasicCharacter(overrides);
	actor.flags["masks-newgeneration-unofficial"] = {
		...(actor.flags["masks-newgeneration-unofficial"] as Record<string, unknown> || {}),
		lockedLabels,
	};
	return actor;
}

// ============================================================================
// NPC Factories
// ============================================================================

/**
 * Create a basic NPC
 */
export function createBasicNPC(overrides: Partial<MockActorData> = {}): MockActorData {
	return createMockActor({
		name: "Test Villain",
		type: "npc",
		system: {
			stats: {
				danger: { value: 2, label: "Danger" },
				freak: { value: 1, label: "Freak" },
				savior: { value: -1, label: "Savior" },
				superior: { value: 0, label: "Superior" },
				mundane: { value: -1, label: "Mundane" },
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
				tier: { value: 5 },
			},
			resources: {
				forward: { value: 0 },
				ongoing: { value: 0 },
			},
		},
		flags: {},
		...overrides,
	});
}

/**
 * Create an NPC with a specific tier
 */
export function createNPCWithTier(tier: number, overrides: Partial<MockActorData> = {}): MockActorData {
	const npc = createBasicNPC(overrides);
	(npc.system.attributes as Record<string, unknown>).tier = { value: tier };
	return npc;
}

// ============================================================================
// Composite Scenarios
// ============================================================================

/**
 * Create a full test scenario with multiple characters
 */
export function createTestScenario(): {
	pc1: MockActorData;
	pc2: MockActorData;
	villain: MockActorData;
} {
	return {
		pc1: createCharacterWithLabels(
			{ danger: 1, freak: 2, savior: 0, superior: -1, mundane: 1 },
			{ name: "Beacon" }
		),
		pc2: createCharacterWithLabels(
			{ danger: -1, freak: 0, savior: 2, superior: 1, mundane: 1 },
			{ name: "Legacy" }
		),
		villain: createBasicNPC({ name: "Siphon" }),
	};
}

/**
 * Create a character with all label boundaries (for edge case testing)
 */
export function createCharacterAtLabelBounds(
	minLabel: string,
	maxLabel: string,
	overrides: Partial<MockActorData> = {}
): MockActorData {
	const labels: Record<string, number> = {
		danger: 0,
		freak: 0,
		savior: 0,
		superior: 0,
		mundane: 0,
	};
	labels[minLabel] = -2; // Minimum via shifts
	labels[maxLabel] = 3; // Maximum via shifts (advances can push to +4)

	return createCharacterWithLabels(labels, overrides);
}
