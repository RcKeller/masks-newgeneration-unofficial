// module/helpers/shift-labels.ts
// Label shifting functionality for Masks character sheets
// Extracted from turn-cards.ts for use without the Dispatch module

import {
	NS,
	LABEL_BOUNDS,
	getLabelKeysForActor,
	getLabelPath,
	getLabelValue,
} from "../constants";

// Re-export from constants for backward compatibility
export { getLabelKeysForActor, getLabelPath, getLabelValue };

// Utility functions using typed foundry globals
const escape = (s: string): string => foundry.utils.escapeHTML(String(s ?? ""));
const getProp = <T = unknown>(obj: object, path: string): T | undefined => foundry.utils.getProperty<T>(obj, path);

/**
 * Get the display label for a stat key
 */
function statLabel(actor: Actor, key: string): string {
	// Soldier label has a special path and localization
	if (key === "soldier") {
		return game.i18n?.localize("MASKS.CharacterSheets.Playbooks.theSoldierLabel") ?? "Soldier";
	}
	return (
		getProp<string>(actor, `system.stats.${key}.label`) ??
		game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ??
		key.charAt(0).toUpperCase() + key.slice(1)
	);
}

/**
 * Get which labels can be shifted up or down for an actor
 */
export function getShiftableLabels(actor: Actor): {
	canShiftUp: string[];
	canShiftDown: string[];
	labelKeys: string[];
} {
	const lockedLabels = actor.getFlag<Record<string, boolean>>(NS, "lockedLabels") ?? {};
	const labelKeys = getLabelKeysForActor(actor);
	const up: string[] = [];
	const down: string[] = [];
	for (const k of labelKeys) {
		// Skip locked labels
		if (lockedLabels[k]) continue;
		const v = getLabelValue(actor, k);
		if (v < LABEL_BOUNDS.SHIFT_MAX) up.push(k);
		if (v > LABEL_BOUNDS.SHIFT_MIN) down.push(k);
	}
	return { canShiftUp: up, canShiftDown: down, labelKeys };
}

/**
 * Show a dialog prompting the user to select labels to shift
 * @param initialLabel - Optional label key to pre-select (placed in whichever direction is valid)
 * @returns Promise resolving to {up, down} keys or null if cancelled
 */
export async function promptShiftLabels(
	actor: Actor,
	title?: string,
	initialLabel?: string
): Promise<{ up: string; down: string } | null> {
	const { canShiftUp, canShiftDown, labelKeys } = getShiftableLabels(actor);
	if (!canShiftUp.length || !canShiftDown.length) {
		ui.notifications?.warn("No valid label shifts.");
		return null;
	}

	// Determine defaults: ensure up and down are always different
	let defaultUp: string;
	let defaultDown: string;

	if (initialLabel && canShiftUp.includes(initialLabel)) {
		// Clicked label can shift up — put it in up, pick a different one for down
		defaultUp = initialLabel;
		defaultDown = canShiftDown.find((k) => k !== defaultUp) ?? canShiftDown[0];
	} else if (initialLabel && canShiftDown.includes(initialLabel)) {
		// Clicked label can only shift down — put it in down, pick a different one for up
		defaultDown = initialLabel;
		defaultUp = canShiftUp.find((k) => k !== defaultDown) ?? canShiftUp[0];
	} else {
		// No initial label or it's locked — pick first available for each
		defaultUp = canShiftUp[0];
		defaultDown = canShiftDown.find((k) => k !== defaultUp) ?? canShiftDown[0];
	}

	const labels = labelKeys.map((k) => ({
		key: k,
		label: statLabel(actor, k),
		value: getLabelValue(actor, k),
	}));

	const makeOpts = (
		arr: string[],
		selected: string,
		atLimitCheck: (v: number, limit: number) => boolean,
		limit: number,
		suffix: string
	) =>
		labels
			.map((l) => {
				const disabled = !arr.includes(l.key);
				const atLimit = atLimitCheck(l.value, limit);
				const suf = atLimit ? ` (at ${suffix} ${limit})` : "";
				const sel = l.key === selected ? "selected" : "";
				return `<option value="${l.key}" ${disabled ? "disabled" : ""} ${sel}>${escape(l.label)} [${l.value}]${suf}</option>`;
			})
			.join("");

	const optsUp = makeOpts(canShiftUp, defaultUp, (v, h) => v >= h, LABEL_BOUNDS.SHIFT_MAX, "max");
	const optsDown = makeOpts(canShiftDown, defaultDown, (v, l) => v <= l, LABEL_BOUNDS.SHIFT_MIN, "min");

	const content = `<form>
		<p style="margin:0 0 .5rem 0;">Choose one Label to shift <b>up</b> and one <b>down</b>.</p>
		<div class="form-group"><label>Shift up (+1):</label><select name="up">${optsUp}</select></div>
		<div class="form-group"><label>Shift down (-1):</label><select name="down">${optsDown}</select></div>
		<p class="notes" style="margin:.35rem 0 0 0;opacity:.8;">(They must be different.)</p>
	</form>`;

	return foundry.applications.api.DialogV2.wait({
		window: { title: title ?? `Shift Labels: ${actor?.name ?? "Character"}` },
		content,
		rejectClose: false,
		buttons: [
			{
				action: "shift",
				label: "Shift",
				default: true,
				callback: (_event: Event, button: HTMLButtonElement) => {
					const up = (button.form?.querySelector("select[name='up']") as HTMLSelectElement)?.value;
					const down = (button.form?.querySelector("select[name='down']") as HTMLSelectElement)?.value;
					if (!up || !down || up === down) {
						if (up === down) ui.notifications?.warn("Choose two different Labels.");
						return null;
					}
					if (!canShiftUp.includes(up)) {
						const lbl = labels.find((l) => l.key === up);
						ui.notifications?.warn(`${lbl?.label ?? up} is already at max (${LABEL_BOUNDS.SHIFT_MAX}).`);
						return null;
					}
					if (!canShiftDown.includes(down)) {
						const lbl = labels.find((l) => l.key === down);
						ui.notifications?.warn(`${lbl?.label ?? down} is already at min (${LABEL_BOUNDS.SHIFT_MIN}).`);
						return null;
					}
					return { up, down };
				},
			},
			{
				action: "cancel",
				label: "Cancel",
				callback: () => null,
			},
		],
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
	const curUp = getLabelValue(actor, upKey);
	const curDown = getLabelValue(actor, downKey);

	if (curUp >= LABEL_BOUNDS.SHIFT_MAX || curDown <= LABEL_BOUNDS.SHIFT_MIN) {
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
		await ChatMessage.create({ content, style: CONST.CHAT_MESSAGE_STYLES.OTHER });
	}

	return true;
}
