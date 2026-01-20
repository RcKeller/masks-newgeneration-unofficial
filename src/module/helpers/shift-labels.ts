// module/helpers/shift-labels.ts
// Label shifting functionality for Masks character sheets
// Extracted from turn-cards.ts for use without the Dispatch module

import { NS } from "../constants";

// Utility functions using typed foundry globals
const escape = (s: string): string => foundry.utils.escapeHTML(String(s ?? ""));
const getProp = <T = unknown>(obj: object, path: string): T | undefined => foundry.utils.getProperty<T>(obj, path);

// Base labels for all playbooks
const BASE_LABEL_KEYS = Object.freeze([
	"danger",
	"freak",
	"savior",
	"superior",
	"mundane",
]);

/**
 * Get label keys for an actor - The Soldier has an additional "soldier" label
 */
export function getLabelKeysForActor(actor: Actor): string[] {
	const playbook = actor?.system?.playbook?.name ?? "";
	if (playbook === "The Soldier") {
		return [...BASE_LABEL_KEYS, "soldier"];
	}
	return [...BASE_LABEL_KEYS];
}

/**
 * Get the attribute path for a label key
 */
export function getLabelPath(key: string): string {
	// Soldier label uses a different path
	if (key === "soldier") {
		return "system.attributes.theSoldier.value";
	}
	return `system.stats.${key}.value`;
}

/**
 * Get the shift bounds for labels
 * Labels can be shifted between -2 and +3 (advances can push to +4)
 */
function shiftBounds(): { lo: number; hi: number } {
	return {
		lo: -2, // Normal minimum via shifts
		hi: 3,  // Normal maximum via shifts (advances can push to +4)
	};
}

/**
 * Get the display label for a stat key
 */
function statLabel(actor: Actor, key: string): string {
	// Soldier label has a special path and localization
	if (key === "soldier") {
		return game.i18n?.localize("DISPATCH.CharacterSheets.Playbooks.theSoldierLabel") ?? "Soldier";
	}
	return (
		getProp<string>(actor, `system.stats.${key}.label`) ??
		game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ??
		key.charAt(0).toUpperCase() + key.slice(1)
	);
}

/**
 * Get the current value of a label
 */
export function getLabelValue(actor: Actor, key: string): number {
	return Number(getProp(actor, getLabelPath(key))) || 0;
}

/**
 * Get which labels can be shifted up or down for an actor
 */
export function getShiftableLabels(actor: Actor): {
	canShiftUp: string[];
	canShiftDown: string[];
	labelKeys: string[];
} {
	const { lo, hi } = shiftBounds();
	const lockedLabels = actor.getFlag<Record<string, boolean>>(NS, "lockedLabels") ?? {};
	const labelKeys = getLabelKeysForActor(actor);
	const up: string[] = [];
	const down: string[] = [];
	for (const k of labelKeys) {
		// Skip locked labels
		if (lockedLabels[k]) continue;
		const v = getLabelValue(actor, k);
		if (v < hi) up.push(k);
		if (v > lo) down.push(k);
	}
	return { canShiftUp: up, canShiftDown: down, labelKeys };
}

/**
 * Show a dialog prompting the user to select labels to shift
 * @returns Promise resolving to {up, down} keys or null if cancelled
 */
export async function promptShiftLabels(
	actor: Actor,
	title?: string
): Promise<{ up: string; down: string } | null> {
	const { canShiftUp, canShiftDown, labelKeys } = getShiftableLabels(actor);
	if (!canShiftUp.length || !canShiftDown.length) {
		ui.notifications?.warn("No valid label shifts.");
		return null;
	}

	const labels = labelKeys.map((k) => ({
		key: k,
		label: statLabel(actor, k),
		value: getLabelValue(actor, k),
	}));
	const { lo, hi } = shiftBounds();

	const makeOpts = (
		arr: string[],
		atLimitCheck: (v: number, limit: number) => boolean,
		limit: number,
		suffix: string
	) =>
		labels
			.map((l) => {
				const disabled = !arr.includes(l.key);
				const atLimit = atLimitCheck(l.value, limit);
				const suf = atLimit ? ` (at ${suffix} ${limit})` : "";
				return `<option value="${l.key}" ${disabled ? "disabled" : ""}>${escape(l.label)} [${l.value}]${suf}</option>`;
			})
			.join("");

	const optsUp = makeOpts(canShiftUp, (v, h) => v >= h, hi, "max");
	const optsDown = makeOpts(canShiftDown, (v, l) => v <= l, lo, "min");

	const content = `<form>
		<p style="margin:0 0 .5rem 0;">Choose one Label to shift <b>up</b> and one <b>down</b>.</p>
		<div class="form-group"><label>Shift up (+1):</label><select name="up">${optsUp}</select></div>
		<div class="form-group"><label>Shift down (-1):</label><select name="down">${optsDown}</select></div>
		<p class="notes" style="margin:.35rem 0 0 0;opacity:.8;">(They must be different.)</p>
	</form>`;

	return new Promise((resolve) => {
		new Dialog({
			title: title ?? `Shift Labels: ${actor?.name ?? "Character"}`,
			content,
			buttons: {
				ok: {
					label: "Shift",
					callback: (html: JQuery) => {
						const up = (html[0]?.querySelector("select[name='up']") as HTMLSelectElement)?.value;
						const down = (html[0]?.querySelector("select[name='down']") as HTMLSelectElement)?.value;
						if (!up || !down || up === down) {
							if (up === down) ui.notifications?.warn("Choose two different Labels.");
							return resolve(null);
						}
						if (!canShiftUp.includes(up) || !canShiftDown.includes(down)) {
							ui.notifications?.warn("Invalid selection.");
							return resolve(null);
						}
						resolve({ up, down });
					},
				},
				cancel: { label: "Cancel", callback: () => resolve(null) },
			},
			default: "ok",
			close: () => resolve(null),
			render: (html: JQuery) => {
				const upSel = html[0]?.querySelector("select[name='up']") as HTMLSelectElement;
				const downSel = html[0]?.querySelector("select[name='down']") as HTMLSelectElement;
				if (upSel) upSel.value = canShiftUp[0] || labelKeys[0];
				if (downSel) {
					downSel.value = canShiftDown.find((k) => k !== canShiftUp[0]) || canShiftDown[0] || labelKeys[1];
				}
			},
		}).render(true);
	});
}

/**
 * Apply a label shift to an actor
 * @param actor The actor to shift labels on
 * @param upKey The label key to increase
 * @param downKey The label key to decrease
 * @param options Additional options
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function applyShiftLabels(
	actor: Actor,
	upKey: string,
	downKey: string,
	{ announce = true, reason = "shift", sourceActor = null as Actor | null } = {}
): Promise<boolean> {
	const { lo, hi } = shiftBounds();
	const curUp = getLabelValue(actor, upKey);
	const curDown = getLabelValue(actor, downKey);

	if (curUp >= hi || curDown <= lo) {
		ui.notifications?.warn("Labels at limits.");
		return false;
	}

	const newUp = curUp + 1;
	const newDown = curDown - 1;
	await actor.update({ [getLabelPath(upKey)]: newUp, [getLabelPath(downKey)]: newDown });

	if (announce) {
		const upLabel = statLabel(actor, upKey);
		const downLabel = statLabel(actor, downKey);
		const name = escape(actor.name ?? "");

		let content =
			reason === "useInfluence" && sourceActor
				? `<b>${escape(sourceActor.name ?? "")}</b> uses Influence to shift <b>${name}</b>'s Labels:<br/>`
				: `<b>${name}</b> shifts their Labels:<br/>`;

		// Show actual value changes like other resource messages
		content += `<span class="shift up">${escape(upLabel)}: ${curUp} → <b>${newUp}</b></span>, `;
		content += `<span class="shift down">${escape(downLabel)}: ${curDown} → <b>${newDown}</b></span>`;
		await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
	}

	return true;
}
