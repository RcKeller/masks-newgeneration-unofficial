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
	/** Special type for Bull - left click shares move + adds ongoing, right click removes ongoing */
	BULL_HEART: "bull_heart",
	/** Special type for sharing a checklist to chat (Beacon drives, Newborn lessons, etc.) */
	CHECKLIST: "checklist",
	/** Special type for Doomed - numeric but shares doom triggers on increment */
	DOOM_TRACK: "doom_track",
	/** Special type for Nomad - shows influence checklist */
	INFLUENCE_CHECKLIST: "influence_checklist",
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
				type: TrackerType.DOOM_TRACK,
				icon: "fa-solid fa-skull",
				attrPath: "system.attributes.theDoomed.value",
				maxPath: "system.attributes.theDoomed.max",
				doomTriggersPath: "system.attributes.bringsDoomCloser.options",
				min: 0,
				max: 5,
				color: "#9333ea", // purple-600
				label: "Doom Track",
				tooltip: (val, max) => `Doom: ${val}/${max} (click to increment)`,
			},
		],
	},

	"The Bull": {
		left: [
			{
				id: "heart",
				type: TrackerType.BULL_HEART,
				icon: "fa-solid fa-skull-cow",
				color: "#dc2626", // red-600
				label: "Bull's Heart",
				moveNamePrefix: "Bull's Heart",
				// getValue returns ongoing value for fill display
				getValue: (actor) => {
					return Number(foundry.utils.getProperty(actor, "system.resources.ongoing.value")) || 0;
				},
				min: 0,
				max: 1, // Toggle mode: 0 or 1 ongoing
				tooltip: (val) => `Bull's Heart${val > 0 ? " (active)" : ""} | Left: activate | Right: deactivate`,
			},
		],
	},

	"The Janus": {
		right: [
			{
				id: "obligations",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-mask",
				color: "#1E88E5", // orange-600
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
		right: [
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
				type: TrackerType.CHECKLIST,
				icon: "fa-solid fa-face-angry-horns",
				color: "#B71C1C", // pink-500
				label: "Steps",
				fillable: true,
				attrPath: "system.attributes.theInnocent.options",
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.hchc-playbook-innocent.G7BR8AutpZGsV7hL",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theInnocent.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 5,
				tooltip: (val) => `Steps: ${val}/5 (click to share checked)`,
				checklistTitle: "Your Future Self",
				headerTitle: "Future Self", // Header will be "[Actor]'s Future Self"
				checkedOnly: true, // Only share checked items
			},
		],
	},

	"The Beacon": {
		right: [
			{
				id: "drives",
				type: TrackerType.CHECKLIST,
				icon: "fa-solid fa-bullseye-arrow",
				color: "#22c55e", // green-500
				label: "Drives",
				fillable: true,
				attrPath: "system.attributes.theBeacon.options",
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.basic-playbook-beacon.V9TJpzXAyulP7Bd5",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theBeacon.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 4,
				tooltip: (val) => `Drives: ${val}/4 (click to share)`,
				checklistTitle: "Drives",
			},
		],
	},

	"The Reformed": {
		right: [
			{
				id: "obligations",
				type: TrackerType.CHECKLIST,
				icon: "fa-solid fa-hockey-mask",
				color: "#B71C1C", // red-600 - to match villain theme
				label: "Obligations",
				attrPath: "system.attributes.theReformed.options",
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.hchc-playbook-reformed.zgT2HTOZKOiKXC6T",
				// No getValue - we don't show a number on this tracker
				tooltip: () => `Friends in Low Places (click to share)`,
				checklistTitle: "Friends in Low Places",
				isReformedObligations: true, // Special structure for Reformed
			},
		],
	},

	"The Newborn": {
		right: [
			{
				id: "lessons",
				type: TrackerType.CHECKLIST,
				icon: "fa-solid fa-chalkboard-user",
				color: "#2196F3",
				label: "Lessons",
				fillable: true,
				attrPath: "system.attributes.theNewborn.options",
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.hchc-playbook-newborn.BE7s7N6COZdUfRxx",
				getValue: (actor) => {
					const opts = foundry.utils.getProperty(actor, "system.attributes.theNewborn.options") ?? {};
					return Object.values(opts).filter((o) => o?.value === true).length;
				},
				max: 4,
				tooltip: (val) => `Lessons: ${val}/4 (click to share)`,
				checklistTitle: "A Blank Slate",
			},
		],
	},

	"The Star": {
		right: [
			{
				id: "audience",
				type: TrackerType.CHECKLIST,
				icon: "fa-solid fa-star",
				color: "#FFEB3B", // yellow-500
				label: "Audience",
				// Star has two separate attribute paths for advantages and demands
				attrPathAdvantages: "system.attributes.theStarAdvantages.options",
				attrPathDemands: "system.attributes.theStarDemands.options",
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.hchc-playbook-star.BxIcS3GOuOSuH9E0",
				// No getValue - we don't show a number, just icon click to share
				tooltip: () => `Audience (click to share)`,
				checklistTitle: "Audience",
				isStarAudience: true, // Special handling for Star's dual lists
				noActorNameInHeader: true, // Don't prepend actor name
				noStrikethrough: true, // Don't show crossed out items
			},
		],
	},

	"The Nomad": {
		right: [
			{
				id: "roots",
				type: TrackerType.INFLUENCE_CHECKLIST,
				icon: "fa-solid fa-street-view",
				color: "#EC407A",
				label: "Roots",
				fillable: true,
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.unbound-playbook-nomad.dd9JX7X4CcymgjAK",
				// Count how many others have influence over this character (influence given TO others)
				getValue: (actor) => {
					const influences = actor.getFlag(NS, "influences") ?? [];
					// hasInfluenceOver means THEY have influence over ME (I gave them influence)
					return influences.filter((inf) => inf?.hasInfluenceOver === true).length;
				},
				max: 6,
				tooltip: (val) => `Influence given: ${val}/6 (click to share)`,
				checklistTitle: "Putting Down Roots",
			},
		],
	},

	"The Soldier": {
		left: [
			{
				id: "soldier",
				type: TrackerType.ACTION,
				icon: "fa-duotone fa-regular fa-gun",
				attrPath: "system.attributes.theSoldier.value",
				color: "#4CAF50", // teal-600
				label: "Soldier",
				moveName: "A Higher Calling",
				fillable: true,
				getValue: (actor) => Number(foundry.utils.getProperty(actor, "system.attributes.theSoldier.value")) ?? 2,
				min: -2,
				max: 3,
				tooltip: (val) => `Soldier: ${val} (click to share A Higher Calling)`,
				action: "share",
				position: "top", // Between Forward and Shift Labels
			},
		],
		right: [
			{
				id: "recon",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-binoculars",
				color: "#4CAF50", // same green as soldier stat
				label: "Recon",
				moveName: "Before We Get Started",
				tooltip: () => "Roll: Before We Get Started",
				action: "roll",
			},
		],
	},

	"The Harbinger": {
		right: [
			{
				id: "memories",
				type: TrackerType.ACTION,
				icon: "fa-solid fa-timeline",
				color: "#7c3aed", // violet-600
				label: "Memories",
				attrPath: "system.attributes.theHarbinger.value", // LongText field
				compendiumUUID: "Compendium.masks-newgeneration-unofficial.unbound-playbook-harbinger.HCswUIs9sYKviY0J",
				tooltip: () => "Share: Memories & Connecting the Dots",
				action: "shareMemories", // Special action to share memories field
				checklistTitle: "Connecting the Dots",
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
				max: 99,
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
	"The Joined": null,
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

	// Can the user interact with this tracker? (GM or owner only)
	const canInteract = isGM || isSelf;

	const canEdit = (tracker.type === TrackerType.NUMERIC || tracker.type === TrackerType.DOOM_TRACK) && canInteract;
	const canAct = [
		TrackerType.ACTION,
		TrackerType.BULL_HEART,
		TrackerType.CHECKLIST,
		TrackerType.DOOM_TRACK,
		TrackerType.INFLUENCE_CHECKLIST,
	].includes(tracker.type);
	const isDisplay = tracker.type === TrackerType.DISPLAY;
	// Fillable trackers show the fill effect
	const fillable = tracker.fillable === true || tracker.type === TrackerType.NUMERIC || tracker.type === TrackerType.DOOM_TRACK;

	// For Bull's Heart, hasOngoing indicates the filled state
	const hasOngoing = tracker.type === TrackerType.BULL_HEART && value > 0;

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
		canInteract,
		isDisplay,
		fillable,
		hasOngoing,
		disabled: !canInteract,
		attrPath: tracker.attrPath,
		moveName: tracker.moveName,
		moveNamePrefix: tracker.moveNamePrefix,
		checklistTitle: tracker.checklistTitle,
		compendiumUUID: tracker.compendiumUUID,
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
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
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

	if (tracker.action === "roll") {
		if (!tracker.moveName) {
			console.warn(`[${NS}] Tracker has no moveName:`, trackerId);
			return false;
		}
		return rollMoveByName(actor, tracker.moveName);
	} else if (tracker.action === "share") {
		if (!tracker.moveName) {
			console.warn(`[${NS}] Tracker has no moveName:`, trackerId);
			return false;
		}
		return shareMoveByName(actor, tracker.moveName);
	} else if (tracker.action === "shareMemories") {
		// Harbinger special: share memories field + compendium link
		return shareHarbingerMemories(actor, tracker);
	}

	return false;
}

/**
 * Share Harbinger's Memories to chat (LongText field)
 */
async function shareHarbingerMemories(actor, tracker) {
	if (!actor || !tracker.attrPath) return false;

	const memoriesText = String(foundry.utils.getProperty(actor, tracker.attrPath) ?? "");

	if (!memoriesText || memoriesText.trim() === "") {
		ui.notifications?.warn?.(`No memories found on ${actor.name}`);
		return false;
	}

	const compendiumLink = tracker.compendiumUUID
		? `<p>@UUID[${tracker.compendiumUUID}]{${tracker.checklistTitle}}</p>`
		: "";

	const content = `<h3>${actor.name}'s Memories</h3>
		<p>${memoriesText}</p>
		${compendiumLink}`;

	await ChatMessage.create({
		content,
		speaker: ChatMessage.getSpeaker({ actor }),
		style: CONST.CHAT_MESSAGE_STYLES.OTHER,
	});

	return true;
}

/**
 * Execute Bull's Heart action (toggle mode)
 * Left click (delta=1): Set ongoing to 1 and share the Bull's Heart move
 * Right click (delta=-1): Set ongoing to 0 silently
 */
export async function executeBullHeartAction(actor, delta) {
	if (!actor) return false;

	const { left } = getPlaybookTrackers(actor);
	const tracker = left.find((t) => t.id === "heart");
	if (!tracker) return false;

	// Get current ongoing value (resources, not attributes!)
	const currentOngoing = Number(foundry.utils.getProperty(actor, "system.resources.ongoing.value")) || 0;

	if (delta > 0) {
		// Left click: Set ongoing to 1 (toggle on) and share the move
		if (currentOngoing >= 1) {
			// Already active, just share the move without changing value
			const movePrefix = tracker.moveNamePrefix ?? "Bull's Heart";
			const move = actor.items.find(
				(i) => i.type === "move" && i.name.toLowerCase().startsWith(movePrefix.toLowerCase())
			);

			if (move) {
				if (typeof move.toChat === "function") {
					await move.toChat();
				} else {
					await ChatMessage.create({
						content: `<h3>${move.name}</h3><p>${move.system.description ?? ""}</p>`,
						speaker: ChatMessage.getSpeaker({ actor }),
						style: CONST.CHAT_MESSAGE_STYLES.OTHER,
					});
				}
			}
			return true;
		}

		// Activate: set to 1 and share move
		const movePrefix = tracker.moveNamePrefix ?? "Bull's Heart";
		const move = actor.items.find(
			(i) => i.type === "move" && i.name.toLowerCase().startsWith(movePrefix.toLowerCase())
		);

		if (move) {
			// Share the move to chat
			if (typeof move.toChat === "function") {
				await move.toChat();
			} else {
				await ChatMessage.create({
					content: `<h3>${move.name}</h3><p>${move.system.description ?? ""}</p>`,
					speaker: ChatMessage.getSpeaker({ actor }),
					style: CONST.CHAT_MESSAGE_STYLES.OTHER,
				});
			}
		} else {
			ui.notifications?.warn?.(`Move starting with "${movePrefix}" not found on ${actor.name}`);
		}

		// Set ongoing to 1
		await actor.update({ "system.resources.ongoing.value": 1 });
		ui.notifications?.info?.(`${actor.name}: +1 ongoing (Bull's Heart active)`);
	} else {
		// Right click: Set ongoing to 0 (toggle off)
		if (currentOngoing > 0) {
			await actor.update({ "system.resources.ongoing.value": 0 });
			ui.notifications?.info?.(`${actor.name}: Bull's Heart deactivated`);
		}
	}

	return true;
}

/**
 * Helper to extract valid checklist items
 * PbtA stores user-entered text in `userLabel`, while `label` contains the placeholder "[Text]"
 */
function extractChecklistItems(opts, checkedOnly = false) {
	const entries = Object.entries(opts);

	const filtered = entries.filter(([key, opt]) => {
		// Get the actual label - prefer userLabel (user-entered text), fall back to label
		const actualLabel = opt?.userLabel ?? opt?.label ?? "";

		// Must have a non-empty label that's not the placeholder
		if (!actualLabel || actualLabel === "[Text]" || actualLabel.trim() === "") {
			return false;
		}
		// If checkedOnly, only include checked items
		if (checkedOnly && opt.value !== true) {
			return false;
		}
		return true;
	});

	return filtered.map(([key, opt]) => ({
		// Use userLabel if available, otherwise label
		label: opt.userLabel ?? opt.label,
		checked: opt.value === true,
	}));
}

/**
 * Build HTML for a checklist
 * @param items - Array of checklist items
 * @param showCheckboxes - Whether to show checkbox symbols
 * @param noStrikethrough - If true, don't add strikethrough to checked items
 */
function buildChecklistHtml(items, showCheckboxes = true, noStrikethrough = false) {
	return items
		.map((item) => {
			if (showCheckboxes) {
				const checkbox = item.checked ? "☑" : "☐";
				const strikethrough = !noStrikethrough && item.checked ? "text-decoration: line-through; opacity: 0.7;" : "";
				return `<li style="${strikethrough}">${checkbox} ${item.label}</li>`;
			} else {
				return `<li>• ${item.label}</li>`;
			}
		})
		.join("");
}

/**
 * Execute Checklist action - share a checklist to chat
 * Handles Beacon drives, Newborn lessons, Innocent steps, Reformed obligations, Star audience
 */
export async function executeChecklistAction(actor, trackerId) {
	if (!actor) return false;

	const { left, right } = getPlaybookTrackers(actor);
	const allTrackers = [...left, ...right];
	const tracker = allTrackers.find((t) => t.id === trackerId);

	if (!tracker || tracker.type !== TrackerType.CHECKLIST) {
		return false;
	}

	let listHtml = "";
	const title = tracker.checklistTitle ?? tracker.label;

	// Handle Star's dual lists (advantages + demands)
	if (tracker.isStarAudience) {
		const advOpts = foundry.utils.getProperty(actor, tracker.attrPathAdvantages) ?? {};
		const demOpts = foundry.utils.getProperty(actor, tracker.attrPathDemands) ?? {};

		const advantages = extractChecklistItems(advOpts);
		const demands = extractChecklistItems(demOpts);

		// Star uses noStrikethrough flag - don't cross out checked items
		const noStrike = tracker.noStrikethrough === true;

		if (advantages.length > 0) {
			listHtml += `<p><strong>Advantages:</strong></p><ul style="list-style: none; padding-left: 0.5em;">${buildChecklistHtml(advantages, true, noStrike)}</ul>`;
		}
		if (demands.length > 0) {
			listHtml += `<p><strong>Demands:</strong></p><ul style="list-style: none; padding-left: 0.5em;">${buildChecklistHtml(demands, true, noStrike)}</ul>`;
		}

		if (advantages.length === 0 && demands.length === 0) {
			ui.notifications?.warn?.(`No audience details found on ${actor.name}`);
			return false;
		}
	}
	// Handle Reformed's nested obligations structure
	else if (tracker.isReformedObligations) {
		const opts = foundry.utils.getProperty(actor, tracker.attrPath) ?? {};
		const villains = [];

		for (const [key, opt] of Object.entries(opts)) {
			// Use userLabel (user-entered text) if available, otherwise label
			const villainName = opt?.userLabel ?? opt?.label ?? "";
			if (villainName && villainName !== "[Text]" && villainName.trim() !== "") {
				const obligations = opt.values ? Object.values(opt.values).filter((v) => v?.value === true).length : 0;
				villains.push({ name: villainName, obligations });
			}
		}

		if (villains.length === 0) {
			ui.notifications?.warn?.(`No villain contacts found on ${actor.name}`);
			return false;
		}

		const villainItems = villains.map((v) => `<li>• ${v.name}: ${v.obligations}/4 obligations</li>`).join("");
		listHtml = `<ul style="list-style: none; padding-left: 0.5em;">${villainItems}</ul>`;
	}
	// Standard checklist
	else {
		if (!tracker.attrPath) {
			console.warn(`[${NS}] Checklist tracker has no attrPath:`, trackerId);
			return false;
		}

		const opts = foundry.utils.getProperty(actor, tracker.attrPath) ?? {};
		const items = extractChecklistItems(opts, tracker.checkedOnly);

		if (items.length === 0) {
			const msg = tracker.checkedOnly
				? `No checked ${tracker.label.toLowerCase()} found on ${actor.name}`
				: `No ${tracker.label.toLowerCase()} found on ${actor.name}`;
			ui.notifications?.warn?.(msg);
			return false;
		}

		// For checkedOnly, don't show checkboxes
		listHtml = `<ul style="list-style: none; padding-left: 0.5em;">${buildChecklistHtml(items, !tracker.checkedOnly)}</ul>`;
	}

	// Add compendium link if available
	const compendiumLink = tracker.compendiumUUID ? `<p>@UUID[${tracker.compendiumUUID}]{${title}}</p>` : "";

	// Build header - use headerTitle if available, otherwise checklistTitle
	// If noActorNameInHeader is set, don't prepend actor name
	const headerTitle = tracker.headerTitle ?? title;
	const header = tracker.noActorNameInHeader
		? `<h3>${headerTitle}</h3>`
		: `<h3>${actor.name}'s ${headerTitle}</h3>`;

	const content = `${header}${listHtml}${compendiumLink}`;

	await ChatMessage.create({
		content,
		speaker: ChatMessage.getSpeaker({ actor }),
		style: CONST.CHAT_MESSAGE_STYLES.OTHER,
	});

	return true;
}

/**
 * Execute Doom Track action - increment doom and share triggers
 */
export async function executeDoomTrackAction(actor, delta) {
	if (!actor) return false;

	const { right } = getPlaybookTrackers(actor);
	const tracker = right.find((t) => t.id === "doom");
	if (!tracker) return false;

	const current = Number(foundry.utils.getProperty(actor, tracker.attrPath)) || 0;
	const max = tracker.max ?? 5;
	const min = tracker.min ?? 0;
	const next = Math.max(min, Math.min(max, current + delta));

	if (next === current) return false;

	// Update the doom value
	await actor.update({ [tracker.attrPath]: next });

	// If incrementing, share the doom triggers to chat
	if (delta > 0 && tracker.doomTriggersPath) {
		const triggersOpts = foundry.utils.getProperty(actor, tracker.doomTriggersPath) ?? {};
		const checkedTriggers = extractChecklistItems(triggersOpts, true);

		if (checkedTriggers.length > 0) {
			const triggersList = checkedTriggers.map((t) => `<li>• ${t.label}</li>`).join("");
			const content = `<h3>${actor.name}'s Doom advances to ${next}/${max}</h3>
				<p><em>What brings your doom closer:</em></p>
				<ul style="list-style: none; padding-left: 0.5em;">${triggersList}</ul>`;

			await ChatMessage.create({
				content,
				speaker: ChatMessage.getSpeaker({ actor }),
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			});
		} else {
			// Just announce the doom change
			await ChatMessage.create({
				content: `<h3>${actor.name}'s Doom advances to ${next}/${max}</h3>`,
				speaker: ChatMessage.getSpeaker({ actor }),
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			});
		}
	}

	return true;
}

/**
 * Execute Influence Checklist action - share list of people given influence to
 * Used for The Nomad
 */
export async function executeInfluenceChecklistAction(actor) {
	if (!actor) return false;

	const { right } = getPlaybookTrackers(actor);
	const tracker = right.find((t) => t.id === "roots");
	if (!tracker) return false;

	const influences = actor.getFlag(NS, "influences") ?? [];
	// hasInfluenceOver means THEY have influence over ME (I gave them influence)
	const givenTo = influences
		.filter((inf) => inf?.hasInfluenceOver === true && inf?.name)
		.map((inf) => inf.name);

	if (givenTo.length === 0) {
		ui.notifications?.warn?.(`${actor.name} hasn't given influence to anyone yet.`);
		return false;
	}

	const listItems = givenTo.map((name) => `<li>• ${name}</li>`).join("");
	const compendiumLink = tracker.compendiumUUID ? `<p>@UUID[${tracker.compendiumUUID}]{${tracker.checklistTitle}}</p>` : "";

	const content = `<h3>${actor.name}'s ${tracker.checklistTitle}</h3>
		<p><em>Influence given to (${givenTo.length}/6):</em></p>
		<ul style="list-style: none; padding-left: 0.5em;">${listItems}</ul>
		${compendiumLink}`;

	await ChatMessage.create({
		content,
		speaker: ChatMessage.getSpeaker({ actor }),
		style: CONST.CHAT_MESSAGE_STYLES.OTHER,
	});

	return true;
}
