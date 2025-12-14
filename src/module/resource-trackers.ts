// module/resource-trackers.mjs
// Playbook-specific resource trackers for Turn Cards HUD
/* global game, ChatMessage, CONST, foundry */

const NS = "masks-newgeneration-unofficial";

// ────────────────────────────────────────────────────────────────────────────
// Playbook Resource Tracker Definitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resource tracker type enumeration
 */
export const TrackerType = Object.freeze({
	/** Numeric tracker with min/max bounds, can increment/decrement */
	NUMERIC: "numeric",
	/** Display only - shows a value but clicking performs an action (roll/share) */
	ACTION: "action",
	/** Non-interactive display only */
	DISPLAY: "display",
});

/**
 * Playbook resource tracker configurations
 * Each playbook can have trackers on the left (above Advantage/Shift) or right (above Potential)
 */
export const PLAYBOOK_TRACKERS = Object.freeze({
	"The Doomed": {
		right: [
			{
				id: "doom",
				type: TrackerType.NUMERIC,
				icon: "fa-solid fa-skull",
				attrPath: "system.attributes.theDoomed.value",
				maxPath: "system.attributes.theDoomed.max",
				min: 0,
				max: 5,
				color: "#9333ea", // purple-600
				label: "Doom Track",
				tooltip: (val, max) => `Doom: ${val}/${max}`,
			},
		],
	},

	"The Bull": {
		left: [
			{
				id: "heart",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-skull-cow",
				color: "#dc2626", // red-600
				label: "Bull's Heart",
				moveName: "The Bull's Heart",
				tooltip: () => "Share: The Bull's Heart (+1 ongoing love/rival)",
				action: "share",
			},
		],
	},

	"The Janus": {
		right: [
			{
				id: "obligations",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-house-chimney-crack",
				color: "#ea580c", // orange-600
				label: "Time Passes",
				moveName: "When Time Passes",
				tooltip: () => "Roll: When Time Passes",
				action: "roll",
			},
		],
	},

	"The Legacy": {
		right: [
			{
				id: "legacy",
				type: TrackerType.ACTION,
				icon: "fa-sharp-duotone fa-solid fa-user-group",
				color: "#0891b2", // cyan-600
				label: "Time Passes",
				moveName: "Whenever time passes",
				tooltip: () => "Roll: Whenever time passes",
				action: "roll",
			},
		],
	},

	"The Nova": {
		left: [
			{
				id: "burn",
				type: TrackerType.NUMERIC,
				icon: "fa-solid fa-fire",
				attrPath: "system.attributes.theNova.value",
				min: 0,
				max: 3,
				color: "#f97316", // orange-500
				label: "Burn",
				tooltip: (val) => `Burn: ${val}/3`,
			},
		],
	},

	"The Innocent": {
		right: [
			{
				id: "steps",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-stairs",
				color: "#ec4899", // pink-500
				label: "Steps",
				moveName: "Your Future Self",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theInnocent.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 5,
				tooltip: (val) => `Steps: ${val}/5 (Share: Your Future Self)`,
				action: "share",
			},
		],
	},

	"The Beacon": {
		right: [
			{
				id: "drives",
				type: TrackerType.DISPLAY,
				icon: "fa-solid fa-bullseye-arrow",
				color: "#22c55e", // green-500
				label: "Drives",
				fillable: true, // Display but with fill effect
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theBeacon.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 4,
				tooltip: (val) => `Drives: ${val}/4 (edit on sheet)`,
			},
		],
	},

	"The Reformed": {
		right: [
			{
				id: "obligations",
				type: TrackerType.DISPLAY,
				icon: "fa-sharp fa-solid fa-hockey-mask",
				color: "#64748b", // slate-500
				label: "Obligations",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theReformed.options") ?? {};
					let total = 0;
					for (const opt of Object.values(opts)) {
						if (opt?.values) {
							total += Object.values(opt.values).filter((v) => v?.value === true).length;
						}
					}
					return total;
				},
				max: 12, // 3 villains * 4 boxes
				tooltip: (val) => `Obligations: ${val} marked (edit on sheet)`,
			},
		],
	},

	"The Newborn": {
		right: [
			{
				id: "lessons",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-chalkboard-user",
				color: "#8b5cf6", // violet-500
				label: "Lessons",
				moveName: "A Blank Slate",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theNewborn.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 4,
				tooltip: (val) => `Lessons: ${val}/4 (Share: A Blank Slate)`,
				action: "share",
			},
		],
	},

	"The Star": {
		right: [
			{
				id: "audience",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-star",
				color: "#eab308", // yellow-500
				label: "Audience",
				moveName: "Audience",
				tooltip: () => "Share: Audience",
				action: "share",
			},
		],
	},

	"The Nomad": {
		right: [
			{
				id: "roots",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-street-view",
				color: "#0d9488", // teal-600
				label: "Roots",
				moveName: "Putting Down Roots",
				// Count how many others have influence over this character (influence given TO others)
				getValue: (actor) => {
					const influences = actor.getFlag("dispatch", "influences") ?? [];
					// haveInfluenceOver means THEY have influence over ME (I gave them influence)
					return influences.filter((inf) => inf?.haveInfluenceOver === true).length;
				},
				max: 6,
				tooltip: (val) => `Influence given: ${val}/6 (Share: Putting Down Roots)`,
				action: "share",
			},
		],
	},

	"The Soldier": {
		left: [
			{
				id: "soldier",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-person-rifle",
				attrPath: "system.attributes.theSoldier.value",
				color: "#1e40af", // blue-800
				label: "Soldier",
				moveName: "A Higher Calling",
				getValue: (actor) => Number(foundry.utils.getProperty(actor, "system.attributes.theSoldier.value")) ?? 2,
				tooltip: (val) => `Soldier: ${val} (Share: A Higher Calling)`,
				action: "share",
				position: "beside", // Special: to the right of Shift Labels
			},
		],
	},

	"The Harbinger": {
		right: [
			{
				id: "dots",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-timeline",
				color: "#7c3aed", // violet-600
				label: "Connecting",
				moveName: "Connecting the Dots",
				tooltip: () => "Share: Connecting the Dots",
				action: "share",
			},
		],
	},

	"The Scion": {
		right: [
			{
				id: "respect",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-face-saluting",
				color: "#be123c", // rose-700
				label: "Respect",
				moveName: "Respect",
				tooltip: () => "Share: Respect",
				action: "share",
			},
		],
	},

	"The Brain": {
		right: [
			{
				id: "gadgets",
				type: TrackerType.NUMERIC,
				icon: "fa-solid fa-microchip",
				attrPath: "system.attributes.theBrainGadgets.value",
				min: 0,
				max: 99, // No practical limit
				color: "#059669", // emerald-600
				label: "Gadgets",
				tooltip: (val) => `Gadgets: ${val}`,
			},
		],
	},

	// Playbooks with no unique trackers
	"The Delinquent": null,
	"The Outsider": null,
	"The Transformed": null,
	"The Protégé": null,
	"The Joined": null, // Complex bonds system, not easily represented as single tracker
});

// ────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the playbook name from an actor
 */
export function getPlaybookName(actor) {
	return actor?.system?.playbook?.name ?? "";
}

/**
 * Get playbook tracker configurations for an actor
 * @param {Actor} actor - The actor
 * @returns {{ left: TrackerConfig[], right: TrackerConfig[] }} Tracker configs by position
 */
export function getPlaybookTrackers(actor) {
	const playbook = getPlaybookName(actor);
	const config = PLAYBOOK_TRACKERS[playbook];

	if (!config) {
		return { left: [], right: [] };
	}

	return {
		left: config.left ?? [],
		right: config.right ?? [],
	};
}

/**
 * Get the current value for a tracker
 */
export function getTrackerValue(actor, tracker) {
	if (tracker.getValue) {
		return tracker.getValue(actor);
	}
	if (tracker.attrPath) {
		return Number(foundry.utils.getProperty(actor, tracker.attrPath)) || 0;
	}
	return 0;
}

/**
 * Get the max value for a tracker
 */
export function getTrackerMax(tracker, actor) {
	if (typeof tracker.max === "number") {
		return tracker.max;
	}
	if (tracker.maxPath && actor) {
		return Number(foundry.utils.getProperty(actor, tracker.maxPath)) || 5;
	}
	return 5;
}

/**
 * Build tracker display data for template rendering
 */
export function buildTrackerData(actor, tracker, { isGM, isSelf }) {
	const value = getTrackerValue(actor, tracker);
	const max = getTrackerMax(tracker, actor);
	const pct = max > 0 ? Math.round((value / max) * 100) : 0;

	const canEdit = tracker.type === TrackerType.NUMERIC && (isGM || isSelf);
	const canAct = tracker.type === TrackerType.ACTION;
	const isDisplay = tracker.type === TrackerType.DISPLAY;
	// Fillable trackers show the fill effect (like numeric trackers) even if they're display/action type
	const fillable = tracker.fillable === true || tracker.type === TrackerType.NUMERIC;

	return {
		id: tracker.id,
		type: tracker.type,
		icon: tracker.icon,
		color: tracker.color,
		label: tracker.label,
		value,
		max,
		pct: `${pct}%`,
		tooltip: tracker.tooltip ? tracker.tooltip(value, max) : tracker.label,
		canEdit,
		canAct,
		isDisplay,
		fillable,
		disabled: isDisplay && !isGM && !isSelf && !tracker.fillable,
		attrPath: tracker.attrPath,
		moveName: tracker.moveName,
		action: tracker.action,
		position: tracker.position ?? "top",
	};
}

/**
 * Get all tracker data for an actor ready for template rendering
 */
export function getTrackerDataForActor(actor, { isGM, isSelf }) {
	const { left, right } = getPlaybookTrackers(actor);

	// Process left trackers - separate beside position (Soldier next to Shift Labels) from top
	const leftTop = [];
	const leftBeside = []; // Beside shift labels (to the right of it)
	for (const tracker of left) {
		const data = buildTrackerData(actor, tracker, { isGM, isSelf });
		if (data.position === "beside") {
			leftBeside.push(data);
		} else {
			leftTop.push(data);
		}
	}

	// Process right trackers
	const rightTop = right.map((t) => buildTrackerData(actor, t, { isGM, isSelf }));

	return {
		leftTop,
		leftBeside,
		rightTop,
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Resource Change Actions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Change a numeric tracker value
 */
export async function changeTrackerValue(actor, trackerId, delta) {
	const { left, right } = getPlaybookTrackers(actor);
	const allTrackers = [...left, ...right];
	const tracker = allTrackers.find((t) => t.id === trackerId);

	if (!tracker || tracker.type !== TrackerType.NUMERIC) {
		console.warn(`[${NS}] Tracker not found or not numeric:`, trackerId);
		return false;
	}

	if (!tracker.attrPath) {
		console.warn(`[${NS}] Tracker has no attrPath:`, trackerId);
		return false;
	}

	const current = getTrackerValue(actor, tracker);
	const max = getTrackerMax(tracker, actor);
	const min = tracker.min ?? 0;
	const next = Math.max(min, Math.min(max, current + delta));

	if (next === current) return false;

	await actor.update({ [tracker.attrPath]: next });
	return true;
}

/**
 * Roll a move item from the actor's owned items
 */
export async function rollMoveByName(actor, moveName) {
	if (!actor || !moveName) return false;

	// Find the move item on the actor
	const move = actor.items.find(
		(i) => i.type === "move" && i.name.toLowerCase() === moveName.toLowerCase()
	);

	if (!move) {
		ui.notifications?.warn?.(`Move "${moveName}" not found on ${actor.name}`);
		return false;
	}

	// Use PbtA's roll method if available, otherwise render to chat
	if (typeof move.roll === "function") {
		await move.roll();
	} else {
		// Fallback: share to chat
		await move.toChat?.() ?? ChatMessage.create({
			content: `<h3>${move.name}</h3><p>${move.system.description ?? ""}</p>`,
			speaker: ChatMessage.getSpeaker({ actor }),
		});
	}

	return true;
}

/**
 * Share a move item to chat
 */
export async function shareMoveByName(actor, moveName) {
	if (!actor || !moveName) return false;

	const move = actor.items.find(
		(i) => i.type === "move" && i.name.toLowerCase() === moveName.toLowerCase()
	);

	if (!move) {
		ui.notifications?.warn?.(`Move "${moveName}" not found on ${actor.name}`);
		return false;
	}

	// Share to chat
	if (typeof move.toChat === "function") {
		await move.toChat();
	} else {
		await ChatMessage.create({
			content: `<h3>${move.name}</h3><p>${move.system.description ?? ""}</p>`,
			speaker: ChatMessage.getSpeaker({ actor }),
			type: CONST.CHAT_MESSAGE_TYPES.OTHER,
		});
	}

	return true;
}

/**
 * Execute a tracker action (roll or share)
 */
export async function executeTrackerAction(actor, trackerId) {
	const { left, right } = getPlaybookTrackers(actor);
	const allTrackers = [...left, ...right];
	const tracker = allTrackers.find((t) => t.id === trackerId);

	if (!tracker || tracker.type !== TrackerType.ACTION) {
		console.warn(`[${NS}] Tracker not found or not action type:`, trackerId);
		return false;
	}

	if (!tracker.moveName) {
		console.warn(`[${NS}] Tracker has no moveName:`, trackerId);
		return false;
	}

	if (tracker.action === "roll") {
		return rollMoveByName(actor, tracker.moveName);
	} else if (tracker.action === "share") {
		return shareMoveByName(actor, tracker.moveName);
	}

	return false;
}
