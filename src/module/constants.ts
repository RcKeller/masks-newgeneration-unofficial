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

/** Label value bounds for shifting */
export const LABEL_BOUNDS = Object.freeze({
	/** Minimum value a label can reach via shifts */
	MIN: -2,
	/** Maximum value a label can reach via shifts (advances can push to +4) */
	MAX: 3,
	/** Absolute minimum for roll calculations */
	ROLL_MIN: -3,
	/** Absolute maximum for roll calculations */
	ROLL_MAX: 4,
} as const);

/** Condition names in Masks */
export const CONDITIONS = Object.freeze([
	"afraid",
	"angry",
	"guilty",
	"hopeless",
	"insecure",
] as const);

/** Condition to label mapping - each condition applies -2 to a specific label */
export const CONDITION_TO_LABEL = Object.freeze({
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
