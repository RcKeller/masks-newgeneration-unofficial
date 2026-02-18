/**
 * Module Constants
 * Centralized constants for the masks-newgeneration-unofficial module
 */

/** Module ID / Flag namespace */
export const MODULE_ID = "masks-newgeneration-unofficial";

/** Alias for MODULE_ID - used throughout the codebase */
export const NS = MODULE_ID;

/** Socket namespace for cross-client communication */
export const SOCKET_NS = `module.${MODULE_ID}`;

/** Base label keys for Masks characters */
export const BASE_LABEL_KEYS = Object.freeze([
	"danger",
	"freak",
	"savior",
	"superior",
	"mundane",
] as const);

/** Label value bounds for shifting and rolls */
export const LABEL_BOUNDS = Object.freeze({
	/** Minimum value a label can reach via shifts (-2) */
	SHIFT_MIN: -2,
	/** Maximum value a label can reach via shifts (+3, advances can push to +4) */
	SHIFT_MAX: 3,
	/** Absolute minimum for roll calculations (-3) */
	ROLL_MIN: -3,
	/** Absolute maximum for roll calculations (+4) */
	ROLL_MAX: 4,
	/** Percentage position where value 0 sits on the bar: (0 - ROLL_MIN) / (ROLL_MAX - ROLL_MIN) × 100 */
	BASELINE_PERCENT: ((0 - (-3)) / (4 - (-3))) * 100, // 42.857%
} as const);

/** Condition names in Masks */
export const CONDITIONS = Object.freeze([
	"afraid",
	"angry",
	"guilty",
	"hopeless",
	"insecure",
] as const);

/**
 * Condition to label mapping - each condition applies -2 to a specific label
 * Includes both string names and numeric indices for convenience
 */
export const CONDITION_TO_LABEL = Object.freeze({
	// By condition index (from system.attributes.conditions.options)
	0: "danger",   // Afraid: -2 Danger
	1: "mundane",  // Angry: -2 Mundane
	2: "superior", // Guilty: -2 Superior
	3: "freak",    // Hopeless: -2 Freak
	4: "savior",   // Insecure: -2 Savior
	// By condition name (lowercase)
	afraid: "danger",
	angry: "mundane",
	guilty: "superior",
	hopeless: "freak",
	insecure: "savior",
} as const);

/** Legacy flag namespaces for backward compatibility */
export const LEGACY_NAMESPACES = Object.freeze([
	"masks-newgeneration-sheets",
	"dispatch",
] as const);

/** Special playbook names that affect label handling */
export const SPECIAL_PLAYBOOKS = Object.freeze({
	SOLDIER: "The Soldier",
} as const);

/**
 * Get label keys for an actor - The Soldier has an additional "soldier" label
 * @param actor - The Foundry actor
 * @returns Array of label keys for this actor
 */
export function getLabelKeysForActor(actor: Actor): string[] {
	const playbook = (actor as any)?.system?.playbook?.name ?? "";
	if (playbook === SPECIAL_PLAYBOOKS.SOLDIER) {
		return [...BASE_LABEL_KEYS, "soldier"];
	}
	return [...BASE_LABEL_KEYS];
}

/**
 * Get the attribute path for a label key
 * @param key - The label key (e.g., "danger", "soldier")
 * @returns The full path to the label value in actor data
 */
export function getLabelPath(key: string): string {
	// Soldier label uses a different path
	if (key === "soldier") {
		return "system.attributes.theSoldier.value";
	}
	return `system.stats.${key}.value`;
}

/**
 * Get the current value of a label
 * @param actor - The Foundry actor
 * @param key - The label key
 * @returns The current numeric value of the label
 */
export function getLabelValue(actor: Actor, key: string): number {
	return Number(foundry.utils.getProperty(actor, getLabelPath(key))) || 0;
}
