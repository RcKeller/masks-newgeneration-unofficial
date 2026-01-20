/**
 * Masks-Specific Type Definitions
 * Type definitions for Masks: A New Generation module data structures
 */

import type { BASE_LABEL_KEYS, CONDITIONS } from "../constants";

// ============================================================================
// Label Types
// ============================================================================

/** Valid label keys for Masks characters */
export type LabelKey = (typeof BASE_LABEL_KEYS)[number];

/** Label with soldier for The Soldier playbook */
export type ExtendedLabelKey = LabelKey | "soldier";

/** Label stat structure from PbtA system */
export interface LabelStat {
	value: number;
	label: string;
	min?: number;
	max?: number;
}

/** All labels as a record */
export type LabelStats = Record<LabelKey, LabelStat>;

// ============================================================================
// Condition Types
// ============================================================================

/** Valid condition names */
export type ConditionName = (typeof CONDITIONS)[number];

/** Condition option structure */
export interface ConditionOption {
	value: boolean;
	label?: string;
}

/** Conditions as an indexed record (PbtA uses numeric indices) */
export type ConditionOptions = Record<number, ConditionOption>;

// ============================================================================
// Influence Types
// ============================================================================

/** Influence entry stored in actor flags */
export interface InfluenceEntry {
	/** Unique identifier for this entry */
	id: string;
	/** Name of the character this entry refers to */
	name: string;
	/** Whether THEY have influence over ME (I gave them influence) */
	hasInfluenceOver: boolean;
	/** Whether I have influence over THEM (they gave me influence) */
	haveInfluenceOver: boolean;
	/** Whether this entry is locked (cannot be changed automatically) */
	locked?: boolean;
}

/** Array of influence entries stored in actor flags */
export type InfluenceArray = InfluenceEntry[];

// ============================================================================
// Resource Types
// ============================================================================

/** Resource value structure */
export interface ResourceValue {
	value: number;
	max?: number;
}

/** Character resources */
export interface MasksResources {
	forward: ResourceValue;
	ongoing: ResourceValue;
}

// ============================================================================
// Playbook Types
// ============================================================================

/** Playbook reference */
export interface PlaybookReference {
	name: string;
	uuid?: string;
}

// ============================================================================
// Character System Data
// ============================================================================

/** Masks character system data structure */
export interface MasksCharacterSystem {
	stats: LabelStats;
	attributes: {
		conditions: {
			options: ConditionOptions;
		};
		hp?: ResourceValue;
		xp?: ResourceValue;
		realName?: { value: string };
		// Playbook-specific attributes
		theDoomed?: ResourceValue;
		theNova?: ResourceValue;
		theBeacon?: { options: Record<number, ConditionOption> };
		theNewborn?: { options: Record<number, ConditionOption> };
		theInnocent?: { options: Record<number, ConditionOption> };
		theReformed?: { options: Record<number, ConditionOption> };
		theStarAdvantages?: { options: Record<number, ConditionOption> };
		theStarDemands?: { options: Record<number, ConditionOption> };
		theSoldier?: ResourceValue;
		theHarbinger?: { value: string };
		tier?: ResourceValue;
	};
	resources: MasksResources;
	playbook: PlaybookReference;
}

/** NPC system data structure */
export interface MasksNPCSystem {
	stats: Partial<LabelStats>;
	attributes: {
		conditions: {
			options: ConditionOptions;
		};
		hp?: ResourceValue;
		tier?: ResourceValue;
	};
	resources?: MasksResources;
}

// ============================================================================
// Actor Flags
// ============================================================================

/** Masks module flags stored on actors */
export interface MasksActorFlags {
	influences?: InfluenceArray;
	lockedLabels?: Record<LabelKey, boolean>;
	lastActionTurn?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/** Actor with Masks character system */
export interface MasksCharacterActor extends Actor {
	type: "character";
	system: MasksCharacterSystem;
	flags: {
		"masks-newgeneration-unofficial"?: MasksActorFlags;
	};
}

/** Actor with Masks NPC system */
export interface MasksNPCActor extends Actor {
	type: "npc";
	system: MasksNPCSystem;
	flags: {
		"masks-newgeneration-unofficial"?: MasksActorFlags;
	};
}

/** Union type for any Masks actor */
export type MasksActor = MasksCharacterActor | MasksNPCActor;

// ============================================================================
// Helper Type Guards
// ============================================================================

/** Check if an actor is a Masks character */
export function isMasksCharacter(actor: Actor | null | undefined): actor is MasksCharacterActor {
	return actor?.type === "character";
}

/** Check if an actor is a Masks NPC */
export function isMasksNPC(actor: Actor | null | undefined): actor is MasksNPCActor {
	return actor?.type === "npc";
}

/** Check if a key is a valid label key */
export function isLabelKey(key: string): key is LabelKey {
	return ["danger", "freak", "savior", "superior", "mundane"].includes(key);
}

/** Check if a key is a valid extended label key (includes soldier) */
export function isExtendedLabelKey(key: string): key is ExtendedLabelKey {
	return isLabelKey(key) || key === "soldier";
}
