// module/turn-cards.mjs
// Turn Cards HUD - Using v13 Query System for reliable GM delegation
// Handles: Team Pool, Cooldown System, Potential, Forward/Aid, Label Shifting, Playbook Resources
/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, CONFIG, Handlebars */

import {
	compositeKey,
	InfluenceIndex,
} from "./helpers/influence";

import { HookRegistry } from "./helpers/hook-registry";
import { createLabelsGraphData, saveGraphAnimationState, animateGraphFromSavedState } from "./labels-graph";

import {
	getPlaybookName,
	getTrackerDataForActor,
	changeTrackerValue,
	executeTrackerAction,
	executeBullHeartAction,
	executeChecklistAction,
	executeDoomTrackAction,
	executeInfluenceChecklistAction,
	TrackerType,
} from "./resource-trackers";


const NS = "masks-newgeneration-unofficial";
const SOCKET_NS = `module.${NS}`;
const TEMPLATE = `modules/${NS}/templates/turncards.hbs`;

// Flags
const FLAG_COOLDOWN = "turnCardsCooldownRemaining";
const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential";

// Constants
const POTENTIAL_MAX = 5;
const AID_MOVE_UUID =
	"@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}";
// Base labels for all playbooks
const BASE_LABEL_KEYS = Object.freeze([
	"danger",
	"freak",
	"savior",
	"superior",
	"mundane",
]);

// Get label keys for an actor - The Soldier has an additional "soldier" label
function getLabelKeysForActor(actor) {
	const playbook = actor?.system?.playbook?.name ?? "";
	if (playbook === "The Soldier") {
		return [...BASE_LABEL_KEYS, "soldier"];
	}
	return [...BASE_LABEL_KEYS];
}

// Get the attribute path for a label key
function getLabelPath(key) {
	// Soldier label uses a different path
	if (key === "soldier") {
		return "system.attributes.theSoldier.value";
	}
	return `system.stats.${key}.value`;
}

// Backward compatible - used in some places
const LABEL_KEYS = BASE_LABEL_KEYS;

// Prevent spam double-clicking
const pendingOps = new Set();

// ────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────

const isGM = () => game.user?.isGM === true;
const hasActiveGM = () => game.users?.activeGM != null;
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const getProp = (obj, path) => foundry.utils.getProperty(obj, path);
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(n) || 0)));

function getActiveCombat() {
	return game.combats?.active ?? ui.combat?.viewed ?? null;
}

function canEditActor(actor) {
	return isGM() || actor?.isOwner === true;
}

function userOwnsActor(user, actor) {
	if (!user || !actor) return false;
	if (user.isGM) return true;
	const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
	const lvl = actor.ownership?.[user.id] ?? actor.ownership?.default ?? 0;
	return lvl >= OWNER;
}

function getMyActor() {
	if (game.user?.character) return game.user.character;
	const tok = canvas?.tokens?.placeables?.find((t) => t?.actor?.isOwner);
	return tok?.actor ?? null;
}

function isDowned(combatant) {
	if (combatant?.defeated) return true;
	const hp = Number(getProp(combatant?.actor, "system.attributes.hp.value"));
	return Number.isFinite(hp) && hp <= 0;
}

function getTeamCombatants(combat) {
	const all = combat?.combatants?.contents ?? [];
	const out = [];
	const seenActorIds = new Set();

	for (const cbt of all) {
		const a = cbt?.actor;
		if (!a || a.type !== "character") continue;
		if (seenActorIds.has(a.id)) continue;
		seenActorIds.add(a.id);
		out.push(cbt);
	}
	return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Team Service (Journal-backed with socket sync)
// ────────────────────────────────────────────────────────────────────────────

const TeamService = {
	_doc: null,
	_cache: null,

	async _getDoc(create = false) {
		if (this._doc && game.journal?.has(this._doc.id)) return this._doc;

		const storedId = game.settings.get(NS, "teamDocId");
		if (storedId) {
			const found = game.journal?.get(storedId);
			if (found) return (this._doc = found);
		}

		const byFlag = game.journal?.find((j) => j.getFlag(NS, "isTeamDoc"));
		if (byFlag) {
			await game.settings.set(NS, "teamDocId", byFlag.id);
			return (this._doc = byFlag);
		}

		const byName = game.journal?.find((j) => j.name === "MASKS • Team Pool");
		if (byName) {
			if (isGM()) await byName.setFlag(NS, "isTeamDoc", true);
			await game.settings.set(NS, "teamDocId", byName.id);
			return (this._doc = byName);
		}

		if (create && isGM()) {
			const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
			const doc = await JournalEntry.create(
				{
					name: "MASKS • Team Pool",
					pages: [],
					ownership: { default: OWNER },
					flags: { [NS]: { isTeamDoc: true, team: 0 } },
				},
				{ renderSheet: false }
			);
			await game.settings.set(NS, "teamDocId", doc.id);
			return (this._doc = doc);
		}

		return null;
	},

	async init() {
		this._doc = await this._getDoc(false);
		const v = Number(this._doc?.getFlag?.(NS, "team"));
		if (Number.isFinite(v)) this._cache = Math.max(0, Math.floor(v));
	},

	async ensureReady() {
		if (!isGM()) return;
		const doc = await this._getDoc(true);
		if (!doc) return;

		const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
		if ((doc.ownership?.default ?? 0) !== OWNER) {
			await doc.update({ ownership: { ...doc.ownership, default: OWNER } });
		}
	},

	requestSync() {
		if (isGM()) return;
		game.socket?.emit(SOCKET_NS, {
			action: "turnCardsTeamSyncRequest",
			userId: game.user?.id,
		});
	},

	_broadcast(value, toUserId = null) {
		game.socket?.emit(SOCKET_NS, {
			action: "turnCardsTeamSync",
			value,
			toUserId,
		});
	},

	get canEdit() {
		return isGM() || (game.settings.get(NS, "playersCanEdit") && this._doc?.isOwner);
	},

	get value() {
		const vDoc = Number(this._doc?.getFlag?.(NS, "team"));
		if (Number.isFinite(vDoc)) {
			const n = Math.max(0, Math.floor(vDoc));
			this._cache = n;
			return n;
		}
		if (Number.isFinite(this._cache)) return this._cache;
		return 0;
	},

	async set(n, { announce = true, delta = null } = {}) {
		n = Math.max(0, Math.floor(Number(n) || 0));
		this._doc ??= await this._getDoc(false);

		if (!this._doc) {
			ui.notifications?.warn?.("Team Pool not initialized.");
			return { ok: false, old: this.value, now: this.value };
		}

		const old = this.value;
		if (n === old) return { ok: true, old, now: n };

		if (!this.canEdit && !isGM()) {
			ui.notifications?.warn?.("No permission to edit Team.");
			return { ok: false, old, now: old };
		}

		await this._doc.setFlag(NS, "team", n);
		this._cache = n;
		this._broadcast(n);

		if (announce && game.settings.get(NS, "announceChanges")) {
			const d = delta ?? n - old;
			const sign = d > 0 ? "+" : "";
			// Use notifications instead of chat for team pool changes
			ui.notifications?.info?.(`Team Pool: ${old} → ${n} (${sign}${d})`);
		}

		Hooks.callAll("masksTeamUpdated");
		return { ok: true, old, now: n };
	},

	async change(delta, opts = {}) {
		delta = Math.floor(Number(delta) || 0);
		return this.set(this.value + delta, { ...opts, delta });
	},
};

globalThis.MasksTeam = TeamService;

// ────────────────────────────────────────────────────────────────────────────
// Potential (XP) Service
// ────────────────────────────────────────────────────────────────────────────

function getPotential(actor) {
	const xp = Number(getProp(actor, "system.attributes.xp.value"));
	if (Number.isFinite(xp)) return clampInt(xp, 0, POTENTIAL_MAX);
	const flag = Number(actor?.getFlag?.(NS, FLAG_POTENTIAL_FALLBACK));
	return Number.isFinite(flag) ? clampInt(flag, 0, POTENTIAL_MAX) : 0;
}

async function setPotentialDirect(actor, val) {
	val = clampInt(val, 0, POTENTIAL_MAX);
	const hasXp = getProp(actor, "system.attributes.xp") !== undefined;
	if (hasXp) await actor.update({ "system.attributes.xp.value": val });
	else await actor.setFlag(NS, FLAG_POTENTIAL_FALLBACK, val);
}

// ────────────────────────────────────────────────────────────────────────────
// Forward / Ongoing
// ────────────────────────────────────────────────────────────────────────────

// Bounds for Forward and Ongoing: min -1, max 8
const FORWARD_MIN = -1;
const FORWARD_MAX = 8;

const getForward = (actor) => Number(getProp(actor, "system.resources.forward.value")) || 0;
const getOngoing = (actor) => Number(getProp(actor, "system.resources.ongoing.value")) || 0;

async function adjustForward(actor, delta, { announce = true, isAid = false, byUser = null } = {}) {
	if (!actor) return;

	const cur = getForward(actor);
	const next = clampInt(cur + delta, FORWARD_MIN, FORWARD_MAX);
	if (next === cur) return;

	await actor.update({ "system.resources.forward.value": next });

	if (announce) {
		const sign = delta > 0 ? "+" : "";
		const who = byUser?.name ?? game.user?.name ?? "Player";

		// Aid from one player to another uses chat; self/GM adjustments use notifications
		if (isAid) {
			const content = `<b>${escape(who)}</b>: <b>${escape(actor.name)}</b> Forward ${cur} → <b>${next}</b> (${sign}${delta})<br/>${AID_MOVE_UUID}`;
			await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
		} else {
			ui.notifications?.info?.(`${actor.name} Forward: ${cur} → ${next} (${sign}${delta})`);
		}
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Label Shifting
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the bounds for normal label shifts (not roll modifier caps)
 * Normal label range: -2 to +3 (via shifts)
 * Roll modifier caps: -3 to +4 (those are minMod/maxMod in config)
 * Advances can push a label to +4, but not via normal shifts
 */
function shiftBounds() {
	// These are the NORMAL SHIFT bounds, not roll modifier caps
	// minMod/maxMod from config are for roll modifiers, not shifts
	return {
		lo: -2, // Normal minimum via shifts
		hi: 3,  // Normal maximum via shifts (advances can push to +4)
	};
}

function statLabel(actor, key) {
	// Soldier label has a special path and localization
	if (key === "soldier") {
		return game.i18n?.localize?.("DISPATCH.CharacterSheets.Playbooks.theSoldierLabel") || "Soldier";
	}
	return (
		getProp(actor, `system.stats.${key}.label`) ||
		game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ||
		key.charAt(0).toUpperCase() + key.slice(1)
	);
}

const getLabelValue = (actor, key) => Number(getProp(actor, getLabelPath(key))) || 0;

function getShiftableLabels(actor) {
	const { lo, hi } = shiftBounds();
	const lockedLabels = actor?.getFlag?.(NS, "lockedLabels") ?? {};
	const labelKeys = getLabelKeysForActor(actor);
	const up = [];
	const down = [];
	for (const k of labelKeys) {
		// Skip locked labels
		if (lockedLabels[k]) continue;
		const v = getLabelValue(actor, k);
		if (v < hi) up.push(k);
		if (v > lo) down.push(k);
	}
	return { canShiftUp: up, canShiftDown: down, labelKeys };
}

async function promptShiftLabels(actor, title) {
	const { canShiftUp, canShiftDown, labelKeys } = getShiftableLabels(actor);
	if (!canShiftUp.length || !canShiftDown.length) {
		ui.notifications?.warn?.("No valid label shifts.");
		return null;
	}

	const labels = labelKeys.map((k) => ({
		key: k,
		label: statLabel(actor, k),
		value: getLabelValue(actor, k),
	}));
	const { lo, hi } = shiftBounds();

	const makeOpts = (arr, atLimitCheck, limit, suffix) =>
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
					callback: (html) => {
						const up = html[0]?.querySelector("select[name='up']")?.value;
						const down = html[0]?.querySelector("select[name='down']")?.value;
						if (!up || !down || up === down) {
							if (up === down) ui.notifications?.warn?.("Choose two different Labels.");
							return resolve(null);
						}
						if (!canShiftUp.includes(up) || !canShiftDown.includes(down)) {
							ui.notifications?.warn?.("Invalid selection.");
							return resolve(null);
						}
						resolve({ up, down });
					},
				},
				cancel: { label: "Cancel", callback: () => resolve(null) },
			},
			default: "ok",
			close: () => resolve(null),
			render: (html) => {
				const upSel = html[0]?.querySelector("select[name='up']");
				const downSel = html[0]?.querySelector("select[name='down']");
				if (upSel) upSel.value = canShiftUp[0] || labelKeys[0];
				if (downSel) {
					downSel.value = canShiftDown.find((k) => k !== canShiftUp[0]) || canShiftDown[0] || labelKeys[1];
				}
			},
		}).render(true);
	});
}

async function applyShiftLabels(actor, upKey, downKey, { announce = true, reason = "shift", sourceActor = null } = {}) {
	const { lo, hi } = shiftBounds();
	const curUp = getLabelValue(actor, upKey);
	const curDown = getLabelValue(actor, downKey);

	if (curUp >= hi || curDown <= lo) {
		ui.notifications?.warn?.("Labels at limits.");
		return false;
	}

	const newUp = curUp + 1;
	const newDown = curDown - 1;
	await actor.update({ [getLabelPath(upKey)]: newUp, [getLabelPath(downKey)]: newDown });

	if (announce) {
		const upLabel = statLabel(actor, upKey);
		const downLabel = statLabel(actor, downKey);
		const name = escape(actor.name);

		let content =
			reason === "useInfluence" && sourceActor
				? `<b>${escape(sourceActor.name)}</b> uses Influence to shift <b>${name}</b>'s Labels:<br/>`
				: `<b>${name}</b> shifts their Labels:<br/>`;

		// Show actual value changes like other resource messages
		content += `<span class="shift up">${escape(upLabel)}: ${curUp} → <b>${newUp}</b></span>, `;
		content += `<span class="shift down">${escape(downLabel)}: ${curDown} → <b>${newDown}</b></span>`;
		await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
	}

	return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Cooldown System
// ────────────────────────────────────────────────────────────────────────────

const CooldownSystem = {
	maxCooldown(teamSize) {
		return Math.max(0, Number(teamSize || 0) - 1);
	},

	remaining(cbt, maxCd) {
		const raw = Number(cbt?.getFlag?.(NS, FLAG_COOLDOWN));
		const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
		return maxCd > 0 ? Math.min(n, maxCd) : 0;
	},

	fraction(rem, maxCd) {
		if (maxCd <= 0) return 0;
		return Math.max(0, Math.min(1, rem / maxCd));
	},

	isOnCooldown(cbt, maxCd) {
		return this.remaining(cbt, maxCd) > 0;
	},

	async gmApplyTurn(combat, actingCombatantId = null) {
		if (!combat || !isGM()) return;

		const team = getTeamCombatants(combat);
		const maxCd = this.maxCooldown(team.length);

		const updates = [];
		for (const cbt of team) {
			const oldRaw = Number(cbt.getFlag(NS, FLAG_COOLDOWN));
			const old = Number.isFinite(oldRaw) ? Math.max(0, Math.floor(oldRaw)) : 0;

			let next;
			if (maxCd <= 0) {
				next = 0;
			} else if (actingCombatantId && cbt.id === actingCombatantId) {
				next = maxCd;
			} else {
				next = Math.max(0, Math.min(old, maxCd) - 1);
			}

			if (next !== old) {
				updates.push({ _id: cbt.id, [`flags.${NS}.${FLAG_COOLDOWN}`]: next });
			}
		}

		if (updates.length) {
			await combat.updateEmbeddedDocuments("Combatant", updates);
		}
	},
};

// ────────────────────────────────────────────────────────────────────────────
// Query Handlers (v13 Query System - GM executes these on behalf of players)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Register query handlers in CONFIG.queries during init hook.
 * Players use User#query to invoke these on the active GM.
 */
function registerQueryHandlers() {
	// Mark Action - Player takes their turn
	CONFIG.queries[`${NS}.markAction`] = async function (data) {
		const { combatId, combatantId, userId } = data;
		const combat = game.combats?.get?.(combatId) ?? getActiveCombat();
		const cbt = combat?.combatants?.get?.(combatantId);
		const user = game.users?.get?.(userId);

		if (!combat || !cbt || !user) {
			return { success: false, error: "Invalid combat/combatant/user" };
		}

		// Ownership check
		if (!userOwnsActor(user, cbt.actor)) {
			return { success: false, error: "User does not own actor" };
		}

		await CooldownSystem.gmApplyTurn(combat, cbt.id);
		return { success: true };
	};

	// Aid Teammate - Player spends team to give another player +1 Forward
	CONFIG.queries[`${NS}.aidTeammate`] = async function (data) {
		const { targetActorId, sourceUserId } = data;
		const target = game.actors?.get?.(targetActorId);
		const sourceUser = game.users?.get?.(sourceUserId);

		if (!target || !sourceUser) {
			return { success: false, error: "Invalid target or source user" };
		}

		if (target.type !== "character") {
			return { success: false, error: "Target is not a character" };
		}

		await TeamService.ensureReady();
		await TeamService.init();

		// Check if target is downed
		const combat = getActiveCombat();
		const cbt = combat ? getTeamCombatants(combat).find((c) => c.actor?.id === target.id) : null;
		if (cbt && isDowned(cbt)) {
			return { success: false, error: `${target.name} is Downed` };
		}

		const teamOld = TeamService.value;
		if (teamOld < 1) {
			return { success: false, error: "Not enough Team" };
		}

		// Spend 1 team
		const teamRes = await TeamService.set(teamOld - 1, { announce: false, delta: -1 });
		if (!teamRes.ok) {
			return { success: false, error: "Could not spend Team" };
		}

		// Apply +1 Forward (clamped to bounds)
		const fwdBefore = getForward(target);
		const fwdAfter = clampInt(fwdBefore + 1, FORWARD_MIN, FORWARD_MAX);
		if (fwdAfter !== fwdBefore) {
			await target.update({ "system.resources.forward.value": fwdAfter });
		}

		// Announce with Aid link
		const content = `<b>${escape(sourceUser.name)}</b> spends <b>1 Team</b> to aid <b>${escape(target.name)}</b>!<br/>
Team Pool: ${teamOld} → <b>${teamOld - 1}</b><br/>
<b>${escape(target.name)}</b> gains <b>+1 Forward</b> (now ${fwdAfter}).<br/>
${AID_MOVE_UUID}`;

		await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
		return { success: true };
	};

	// Change Potential
	CONFIG.queries[`${NS}.changePotential`] = async function (data) {
		const { actorId, delta, userId } = data;
		const actor = game.actors?.get?.(actorId);
		const user = game.users?.get?.(userId);

		if (!actor || !user) {
			return { success: false, error: "Invalid actor or user" };
		}

		if (!userOwnsActor(user, actor)) {
			return { success: false, error: "User does not own actor" };
		}

		const cur = getPotential(actor);
		const next = clampInt(cur + Number(delta || 0), 0, POTENTIAL_MAX);
		if (next !== cur) await setPotentialDirect(actor, next);
		return { success: true, newValue: next };
	};

	// Change Forward
	CONFIG.queries[`${NS}.changeForward`] = async function (data) {
		const { actorId, delta, userId } = data;
		const actor = game.actors?.get?.(actorId);
		const user = game.users?.get?.(userId);

		if (!actor || !user) {
			return { success: false, error: "Invalid actor or user" };
		}

		if (!userOwnsActor(user, actor)) {
			return { success: false, error: "User does not own actor" };
		}

		await adjustForward(actor, Number(delta || 0), { announce: true, includeAidLink: false, byUser: user });
		return { success: true };
	};

	// Change Team Pool
	CONFIG.queries[`${NS}.changeTeam`] = async function (data) {
		const { delta } = data;
		if (!delta) return { success: false, error: "No delta" };
		await TeamService.ensureReady();
		await TeamService.init();
		await TeamService.change(delta);
		return { success: true };
	};

	// Shift Labels
	CONFIG.queries[`${NS}.shiftLabels`] = async function (data) {
		const { targetActorId, up, down, reason, sourceActorId } = data;
		const target = game.actors?.get?.(targetActorId);
		if (!target || !up || !down) {
			return { success: false, error: "Invalid parameters" };
		}

		let sourceActor = null;
		if (reason === "useInfluence" && sourceActorId) {
			sourceActor = game.actors?.get?.(sourceActorId);
			if (!sourceActor) return { success: false, error: "Invalid source actor" };
			if (!InfluenceIndex.hasEdgeFromKeyToKey(compositeKey(sourceActor), compositeKey(target))) {
				return { success: false, error: "No influence over target" };
			}
		}

		await applyShiftLabels(target, up, down, {
			announce: true,
			reason: reason ?? "shift",
			sourceActor,
		});
		return { success: true };
	};

	console.log(`[${NS}] Query handlers registered`);
}

// ────────────────────────────────────────────────────────────────────────────
// Socket Handler (for broadcasts only - Team sync)
// ────────────────────────────────────────────────────────────────────────────

/** Module-level socket handler reference for cleanup on hot reload */
let _turnCardsSocketHandler: ((data: unknown) => void) | null = null;

function registerSocketHandler() {
	if (!game.socket) {
		console.warn(`[${NS}] Socket not available`);
		return;
	}

	// Remove existing handler to prevent duplicates on hot reload
	if (_turnCardsSocketHandler) {
		game.socket.off(SOCKET_NS, _turnCardsSocketHandler);
		_turnCardsSocketHandler = null;
	}

	// Create and register new handler
	_turnCardsSocketHandler = async (data: unknown) => {
		const payload = data as { action?: string; toUserId?: string; value?: number; userId?: string } | null;
		if (!payload?.action) return;

		// Everyone receives team sync broadcasts
		if (payload.action === "turnCardsTeamSync") {
			const to = payload.toUserId;
			if (!to || to === game.user?.id) {
				const v = Number(payload.value);
				if (Number.isFinite(v)) TeamService._cache = Math.max(0, Math.floor(v));
				TurnCardsHUD._queueRender();
			}
			return;
		}

		// GM handles sync requests
		if (payload.action === "turnCardsTeamSyncRequest" && isGM()) {
			await TeamService.init();
			TeamService._broadcast(TeamService.value, payload.userId ?? null);
		}
	};

	game.socket.on(SOCKET_NS, _turnCardsSocketHandler);
	console.log(`[${NS}] Socket handler registered`);
}

// ────────────────────────────────────────────────────────────────────────────
// GM Query Helper - Players use this to request GM actions
// ────────────────────────────────────────────────────────────────────────────

/** Pending queries map for deduplication */
const _pendingQueries = new Map<string, Promise<unknown>>();

/**
 * Query the GM with deduplication to prevent duplicate requests.
 * If an identical query is already in flight, returns the existing promise.
 */
async function queryGM(queryName: string, data: object, options: { timeout?: number } = {}) {
	const gm = game.users?.activeGM;
	if (!gm) {
		ui.notifications?.warn?.("GM must be online.");
		return null;
	}

	// Create a key for deduplication (query name + serialized data)
	const key = `${queryName}:${JSON.stringify(data)}`;

	// Return existing promise if query is already in flight
	if (_pendingQueries.has(key)) {
		return _pendingQueries.get(key);
	}

	// Create and track the query promise
	const promise = (async () => {
		try {
			const result = await gm.query(`${NS}.${queryName}`, data, { timeout: options.timeout ?? 10000 });
			if (result && typeof result === 'object' && 'success' in result && !result.success && 'error' in result) {
				ui.notifications?.warn?.(String(result.error));
			}
			return result;
		} catch (err) {
			console.error(`[${NS}] Query failed:`, err);
			ui.notifications?.error?.("Request timed out or failed.");
			return null;
		}
	})().finally(() => {
		// Remove from pending once settled
		_pendingQueries.delete(key);
	});

	_pendingQueries.set(key, promise);
	return promise;
}

// ────────────────────────────────────────────────────────────────────────────
// Turn Cards HUD
// ────────────────────────────────────────────────────────────────────────────

const TurnCardsHUD = {
	root: null as HTMLElement | null,
	_hooks: null as HookRegistry | null,
	_renderQueued: false,
	_lastCooldownFrac: new Map<string, number>(),

	mount() {
		// Cleanup existing state before mounting
		this.unmount();

		const host =
			document.querySelector("#ui-middle #ui-bottom") ||
			document.querySelector("#ui-bottom") ||
			document.querySelector("#ui-middle") ||
			document.body;

		this.root = document.createElement("section");
		this.root.id = "masks-turncards";
		this.root.setAttribute("role", "group");
		this.root.setAttribute("aria-label", "Team Turn Cards");
		host.appendChild(this.root);

		this._bindEvents();
		this._registerHooks();

		TeamService.ensureReady().then(() => TeamService.init());
		TeamService.requestSync();

		this._queueRender();
	},

	unmount() {
		// Cleanup hooks
		if (this._hooks) {
			this._hooks.unregisterAll();
			this._hooks = null;
		}

		// Remove DOM element
		if (this.root) {
			this.root.remove();
			this.root = null;
		}

		this._lastCooldownFrac.clear();
	},

	_bindEvents() {
		if (!this.root || this.root.dataset.bound === "1") return;
		this.root.dataset.bound = "1";

		this.root.addEventListener("click", (ev) => this._onClick(ev), { capture: true });
		this.root.addEventListener("contextmenu", (ev) => this._onRightClick(ev), { capture: true });

		this.root.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") {
				const card = ev.target?.closest?.(".turncard[data-combatant-id]:not(.turncard--team)");
				if (card && !ev.target.closest("button")) {
					ev.preventDefault();
					card.click();
				}
			}
		});
	},

	async _onClick(ev) {
		const target = ev.target instanceof HTMLElement ? ev.target : null;
		if (!target) return;

		const btn = target.closest("[data-action]");
		if (btn) {
			ev.preventDefault();
			ev.stopPropagation();
			await this._handleAction(btn.dataset.action, btn, ev);
			return;
		}

		const card = target.closest(".turncard[data-combatant-id]:not(.turncard--team)");
		if (card) {
			const combat = getActiveCombat();
			const cbt = combat?.combatants?.get?.(card.dataset.combatantId);
			cbt?.actor?.sheet?.render?.(true);
		}
	},

	async _onRightClick(ev) {
		const target = ev.target instanceof HTMLElement ? ev.target : null;
		if (!target) return;

		const potBtn = target.closest("[data-action='potential']");
		if (potBtn) {
			ev.preventDefault();
			ev.stopPropagation();
			await this._handlePotential(potBtn, -1);
			return;
		}

		const fwdBtn = target.closest("[data-action='forward']");
		if (fwdBtn) {
			ev.preventDefault();
			ev.stopPropagation();
			await this._handleForward(fwdBtn, -1);
			return;
		}

		const trackerBtn = target.closest("[data-action='tracker']");
		if (trackerBtn) {
			ev.preventDefault();
			ev.stopPropagation();
			await this._handleTracker(trackerBtn, -1);
			return;
		}

		// GM can right-click a turn card to reset its cooldown
		if (isGM()) {
			const card = target.closest(".turncard[data-combatant-id]:not(.turncard--team)");
			if (card) {
				ev.preventDefault();
				ev.stopPropagation();
				await this._handleResetCooldown(card.dataset.combatantId);
				return;
			}
		}
	},

	async _handleAction(action, el, ev) {
		switch (action) {
			case "potential":
				await this._handlePotential(el, +1);
				break;

			case "forward":
				await this._handleForward(el, +1);
				break;

			case "team-action": {
				const combat = getActiveCombat();
				if (combat && isGM()) {
					await CooldownSystem.gmApplyTurn(combat, null);
				}
				break;
			}

			case "card-action": {
				const combat = getActiveCombat();
				const cbt = combat?.combatants?.get?.(el.dataset.combatantId);
				if (combat && cbt) await this._handleTakeTurn(combat, cbt);
				break;
			}

			case "shift-labels":
				await this._handleShiftLabels(el.dataset.actorId);
				break;

			case "team-minus":
				await this._handleTeamChange(ev.shiftKey ? -5 : -1);
				break;

			case "team-plus":
				await this._handleTeamChange(ev.shiftKey ? 5 : 1);
				break;

			case "team-reset":
				if (isGM() || TeamService.canEdit) await TeamService.set(1);
				else ui.notifications?.warn?.("No permission to reset Team.");
				break;

			case "tracker":
				await this._handleTracker(el, +1);
				break;
		}
	},

	async _handleTakeTurn(combat, cbt) {
		if (!combat || !cbt) return;

		const opKey = `turn-${combat.id}-${cbt.id}`;
		if (pendingOps.has(opKey)) return;
		pendingOps.add(opKey);
		setTimeout(() => pendingOps.delete(opKey), 1500);

		const myActor = getMyActor();
		const isSelf = myActor && cbt.actor?.id === myActor.id;

		if (!isSelf && !isGM()) {
			ui.notifications?.warn?.("Can only take action for your own character.");
			return;
		}

		if (isDowned(cbt)) {
			ui.notifications?.warn?.("Downed characters cannot take actions.");
			return;
		}

		const team = getTeamCombatants(combat);
		const maxCd = CooldownSystem.maxCooldown(team.length);
		const rem = CooldownSystem.remaining(cbt, maxCd);

		if (rem > 0) {
			ui.notifications?.warn?.(`Still on cooldown (${rem} more turn(s)).`);
			return;
		}

		// GM: apply directly
		if (isGM()) {
			await CooldownSystem.gmApplyTurn(combat, cbt.id);
			return;
		}

		// Player: use Query system to ask GM
		if (!hasActiveGM()) {
			ui.notifications?.warn?.("GM must be online to register actions.");
			return;
		}

		await queryGM("markAction", {
			combatId: combat.id,
			combatantId: cbt.id,
			userId: game.user?.id,
		});
	},

	async _handlePotential(el, delta) {
		const actor = game.actors?.get?.(el.dataset.actorId);
		if (!actor) return;

		const myActor = getMyActor();
		const isSelf = myActor && myActor.id === actor.id;

		if (!isSelf && !isGM()) {
			ui.notifications?.warn?.("Can only change your own Potential.");
			return;
		}

		if (canEditActor(actor)) {
			const cur = getPotential(actor);
			const next = clampInt(cur + delta, 0, POTENTIAL_MAX);
			if (next !== cur) await setPotentialDirect(actor, next);
		} else if (hasActiveGM()) {
			await queryGM("changePotential", {
				actorId: actor.id,
				delta,
				userId: game.user?.id,
			});
		} else {
			ui.notifications?.warn?.("GM must be online to change Potential.");
			return;
		}

		el.classList.remove("is-bump");
		void el.offsetHeight;
		el.classList.add("is-bump");
	},

	async _handleForward(el, delta) {
		const targetActor = game.actors?.get?.(el.dataset.actorId);
		if (!targetActor) return;

		const myActor = getMyActor();
		const isSelf = myActor && myActor.id === targetActor.id;

		// Removing forward: self or GM only
		if (delta < 0) {
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only remove Forward from yourself.");
				return;
			}

			if (canEditActor(targetActor)) {
				await adjustForward(targetActor, delta, { announce: true, includeAidLink: false });
			} else if (hasActiveGM()) {
				await queryGM("changeForward", {
					actorId: targetActor.id,
					delta,
					userId: game.user?.id,
				});
			} else {
				ui.notifications?.warn?.("GM must be online to remove Forward.");
			}
			return;
		}

		// Adding forward:
		// - GM: free, no team cost, no aid link
		// - Self: free, no team cost, no aid link
		// - Other player: costs 1 Team, includes aid link
		if (isGM() || isSelf) {
			if (canEditActor(targetActor)) {
				await adjustForward(targetActor, +1, { announce: true, includeAidLink: false });
			} else if (hasActiveGM()) {
				await queryGM("changeForward", {
					actorId: targetActor.id,
					delta: +1,
					userId: game.user?.id,
				});
			} else {
				ui.notifications?.warn?.("GM must be online to add Forward.");
			}
			return;
		}

		// Aid path: player aiding another player (costs team)
		const combat = getActiveCombat();
		const teamValue = TeamService.value;

		// Check if target is downed
		const targetCbt = combat ? getTeamCombatants(combat).find((c) => c.actor?.id === targetActor.id) : null;
		if (targetCbt && isDowned(targetCbt)) {
			ui.notifications?.warn?.("Cannot aid a downed character.");
			return;
		}

		if (teamValue < 1) {
			ui.notifications?.warn?.("Not enough Team to aid (requires 1).");
			return;
		}

		if (!hasActiveGM()) {
			ui.notifications?.warn?.("GM must be online to aid teammates.");
			return;
		}

		await queryGM("aidTeammate", {
			targetActorId: targetActor.id,
			sourceUserId: game.user?.id,
		});
	},

	async _handleShiftLabels(actorId) {
		const actor = game.actors?.get?.(actorId);
		if (!actor) return;

		const myActor = getMyActor();
		const isSelf = myActor && myActor.id === actor.id;

		if (!isSelf && !isGM()) {
			ui.notifications?.warn?.("Can only shift your own Labels.");
			return;
		}

		const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
		if (!canShiftUp.length || !canShiftDown.length) {
			ui.notifications?.warn?.("No valid shifts available.");
			return;
		}

		const picked = await promptShiftLabels(actor, `Shift Labels: ${actor.name}`);
		if (!picked) return;

		if (canEditActor(actor)) {
			await applyShiftLabels(actor, picked.up, picked.down, { announce: true, reason: "shift" });
		} else if (hasActiveGM()) {
			await queryGM("shiftLabels", {
				targetActorId: actor.id,
				up: picked.up,
				down: picked.down,
				reason: "shift",
			});
		} else {
			ui.notifications?.warn?.("A GM must be online.");
		}
	},

	async _handleTracker(el, delta) {
		const actor = game.actors?.get?.(el.dataset.actorId);
		const trackerId = el.dataset.trackerId;
		const trackerType = el.dataset.trackerType;

		if (!actor || !trackerId) return;

		const myActor = getMyActor();
		const isSelf = myActor && myActor.id === actor.id;

		// Handle based on tracker type
		if (trackerType === TrackerType.NUMERIC) {
			// Numeric trackers: owner or GM can change
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only change your own resources.");
				return;
			}

			if (canEditActor(actor)) {
				await changeTrackerValue(actor, trackerId, delta);
			} else {
				ui.notifications?.warn?.("Cannot edit this resource.");
			}

			// Animate the button
			el.classList.remove("is-bump");
			void el.offsetHeight;
			el.classList.add("is-bump");
		} else if (trackerType === TrackerType.ACTION) {
			// Action trackers: owner can trigger (roll/share move)
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only use your own abilities.");
				return;
			}

			await executeTrackerAction(actor, trackerId);
		} else if (trackerType === TrackerType.BULL_HEART) {
			// Bull's Heart: left click shares move + adds ongoing, right click removes ongoing
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only use your own abilities.");
				return;
			}

			await executeBullHeartAction(actor, delta);

			// Animate the button
			el.classList.remove("is-bump");
			void el.offsetHeight;
			el.classList.add("is-bump");
		} else if (trackerType === TrackerType.CHECKLIST) {
			// Checklist trackers: share a checklist to chat
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only use your own abilities.");
				return;
			}

			await executeChecklistAction(actor, trackerId);
		} else if (trackerType === TrackerType.DOOM_TRACK) {
			// Doom Track: increment/decrement and share triggers on increment
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only change your own resources.");
				return;
			}

			await executeDoomTrackAction(actor, delta);

			// Animate the button
			el.classList.remove("is-bump");
			void el.offsetHeight;
			el.classList.add("is-bump");
		} else if (trackerType === TrackerType.INFLUENCE_CHECKLIST) {
			// Nomad's influence checklist: share list of people given influence to
			if (!isSelf && !isGM()) {
				ui.notifications?.warn?.("Can only use your own abilities.");
				return;
			}

			await executeInfluenceChecklistAction(actor);
		}
		// Display trackers are non-interactive (clicks do nothing)
	},

	async _handleTeamChange(delta) {
		if (isGM() || TeamService.canEdit) {
			await TeamService.change(delta);
			return;
		}

		if (!hasActiveGM()) {
			ui.notifications?.warn?.("GM must be online to change Team.");
			return;
		}

		await queryGM("changeTeam", { delta });
	},

	async _handleResetCooldown(combatantId) {
		if (!isGM()) return;

		const combat = getActiveCombat();
		const cbt = combat?.combatants?.get?.(combatantId);
		if (!combat || !cbt) return;

		// Reset cooldown to 0
		await cbt.setFlag(NS, FLAG_COOLDOWN, 0);
		ui.notifications?.info?.(`Reset cooldown for ${cbt.actor?.name ?? "character"}.`);
	},

	_registerHooks() {
		// Create registry if needed
		if (!this._hooks) {
			this._hooks = new HookRegistry();
		}

		// Combat lifecycle hooks
		this._hooks.on("createCombat", () => this._queueRender());
		this._hooks.on("deleteCombat", () => this._queueRender());
		this._hooks.on("updateCombat", () => this._queueRender());
		this._hooks.on("createCombatant", () => this._queueRender());
		this._hooks.on("deleteCombatant", () => this._queueRender());

		// Combatant change detection - optimized with Set
		const combatantWatchedKeys = new Set(["defeated", `flags.${NS}.${FLAG_COOLDOWN}`, "hidden"]);
		this._hooks.on("updateCombatant", (doc: Combatant, changes: object) => {
			const active = getActiveCombat();
			if (!active || doc?.combat?.id !== active.id) return;

			const flat = foundry.utils.flattenObject(changes ?? {});
			const shouldRender = Object.keys(flat).some(k =>
				combatantWatchedKeys.has(k) ||
				[...combatantWatchedKeys].some(w => k.startsWith(w + "."))
			);
			if (shouldRender) this._queueRender();
		});

		// Actor change detection - optimized with Set
		const actorWatchedKeys = new Set([
			"system.attributes.xp.value",
			"system.resources.forward.value",
			"system.resources.ongoing.value",
			"system.attributes.hp.value",
			"system.stats",
			`flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`,
			"img",
			"name",
			// Playbook-specific resource attributes
			"system.attributes.theDoomed",
			"system.attributes.theNova",
			"system.attributes.theNomad",
			"system.attributes.theSoldier",
			"system.attributes.theBrainGadgets",
			"system.attributes.theBeacon",
			"system.attributes.theInnocent",
			"system.attributes.theNewborn",
			"system.attributes.theReformed",
			"system.playbook",
		]);
		this._hooks.on("updateActor", (_actor: Actor, changes: object) => {
			const flat = foundry.utils.flattenObject(changes ?? {});
			const shouldRender = Object.keys(flat).some(k =>
				actorWatchedKeys.has(k) ||
				[...actorWatchedKeys].some(w => k.startsWith(w + "."))
			);
			if (shouldRender) this._queueRender();
		});

		this._hooks.on("updateJournalEntry", (doc: JournalEntry) => {
			if (TeamService._doc && doc.id === TeamService._doc.id) this._queueRender();
		});

		this._hooks.on("canvasReady", () => {
			if (!document.getElementById("masks-turncards")) this.mount();
			else this._queueRender();
		});

		this._hooks.on("masksTeamUpdated", () => this._queueRender());
	},

	_queueRender() {
		if (this._renderQueued) return;
		this._renderQueued = true;

		requestAnimationFrame(async () => {
			try {
				await this.render();
			} finally {
				this._renderQueued = false;
			}
		});
	},

	_applyCooldownBarAnimations() {
		if (!this.root) return;
		const bars = this.root.querySelectorAll(".turncard__cooldown-bar[data-cooldown-target]");

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				for (const bar of bars) {
					const target = Number(bar.dataset.cooldownTarget);
					if (!Number.isFinite(target)) continue;
					bar.style.setProperty("--cooldown-frac", String(Math.max(0, Math.min(1, target))));
				}
			});
		});
	},

	async render() {
		if (!this.root) return;

		const combat = getActiveCombat();
		if (!combat) {
			this.root.style.display = "none";
			this.root.innerHTML = "";
			return;
		}

		const team = getTeamCombatants(combat);
		if (!team.length) {
			this.root.style.display = "none";
			this.root.innerHTML = "";
			return;
		}

		this.root.style.display = "";

		await TeamService.init();

		const teamValue = TeamService.value;
		const teamCanEdit = TeamService.canEdit || isGM();

		const myActor = getMyActor();
		const myActorId = myActor?.id ?? null;

		const maxCd = CooldownSystem.maxCooldown(team.length);

		// Clean old cooldown cache entries
		const presentIds = new Set(team.map((c) => c.id));
		for (const k of Array.from(this._lastCooldownFrac.keys())) {
			if (!presentIds.has(k)) this._lastCooldownFrac.delete(k);
		}

		const cards = team.map((cbt) => {
			const actor = cbt.actor;
			const downed = isDowned(cbt);
			const isSelf = myActorId && actor.id === myActorId;

			const rem = CooldownSystem.remaining(cbt, maxCd);
			const onCooldown = rem > 0;

			const fracTarget = CooldownSystem.fraction(rem, maxCd);
			const prevFrac = this._lastCooldownFrac.get(cbt.id);
			const fracStart = Number.isFinite(prevFrac) ? prevFrac : fracTarget;

			// Store for next render
			this._lastCooldownFrac.set(cbt.id, fracTarget);

			const potential = getPotential(actor);
			const potentialPct = POTENTIAL_MAX > 0 ? `${Math.round((potential / POTENTIAL_MAX) * 100)}%` : "0%";

			const forward = getForward(actor);
			const ongoing = getOngoing(actor);
			const effectiveBonus = forward + ongoing;

			const status = downed ? "down" : onCooldown ? "busy" : "ready";

			// Aid availability: player aiding someone else
			const canAid = !isSelf && !isGM() && !downed && teamValue >= 1;
			const forwardDisabled = !isSelf && !isGM() && !canAid;

			const showActionBtn = status === "ready" && (isGM() || isSelf);
			const statusTooltip = onCooldown ? `Cooldown: ${rem} turn(s) remaining` : "";

			const forwardTooltip =
				isGM() || isSelf
					? `Forward: ${forward} | Ongoing: ${ongoing}`
					: canAid
					? `Aid ${actor.name} (Spend 1 Team to give +1 Forward)`
					: downed
					? "Cannot aid (Downed)"
					: "Cannot aid (Team Pool Empty)";

			// Generate Labels Graph data for pentagon visualization
			// Use showInnerLines=false, showVertexDots=false for cleaner turn card display
			const labelsGraph = createLabelsGraphData(actor, {
				size: 32,
				borderWidth: 0.5,
				showInnerLines: false,
				showVertexDots: false,
			}) ?? {
				svg: "",
				tooltip: "",
				hasBonus: false,
				hasCondition: false,
			};

			// Get playbook-specific tracker data
			const playbook = getPlaybookName(actor);
			const trackers = getTrackerDataForActor(actor, { isGM: isGM(), isSelf });

			return {
				combatantId: cbt.id,
				actorId: actor.id,
				name: actor.name ?? "UNKNOWN",
				img: actor.img ?? "",
				playbook,
				ariaLabel: [actor.name, downed ? "Downed" : null, onCooldown ? `Cooldown (${rem})` : "Ready", `Potential ${potential}/${POTENTIAL_MAX}`]
					.filter(Boolean)
					.join(", "),
				downed,
				downedId: downed ? `turncard-downed-${cbt.id}` : null,

				onCooldown,
				cooldownFrac: fracStart.toFixed(3),
				cooldownFracTarget: fracTarget.toFixed(3),
				remaining: rem,

				potential,
				potentialPct,
				potentialMax: POTENTIAL_MAX,
				canEditPotential: isSelf || isGM(),

				forward,
				ongoing,
				effectiveBonus,
				hasBonus: effectiveBonus !== 0,
				hasNegative: effectiveBonus < 0,
				forwardDisabled,
				forwardTooltip,

				status,
				statusTooltip,
				showActionBtn,
				actionAria: showActionBtn ? `Take action as ${actor.name}` : "",
				canShiftLabels: isSelf || isGM(),
				labelsGraph,
				trackers,
			};
		});

		const context = {
			isGM: isGM(),
			showTeamCard: true,
			teamSize: team.length,
			maxCooldown: maxCd,
			team: teamValue,
			teamCanEdit,
			cards,
		};

		// Save current labels graph states before replacing innerHTML
		this._saveLabelsGraphStates();

		const html = await renderTemplate(TEMPLATE, context);
		this.root.innerHTML = html;

		this._applyCooldownBarAnimations();
		this._animateLabelsGraphs();
	},

	/**
	 * Save current labels graph states for animation (using shared utility)
	 */
	_saveLabelsGraphStates() {
		if (!this.root) return;
		const cards = this.root.querySelectorAll(".turncard[data-actor-id]");
		for (const card of cards) {
			const actorId = card.dataset.actorId;
			if (!actorId) continue;
			saveGraphAnimationState(`turncard-${actorId}`, card as HTMLElement);
		}
	},

	/**
	 * Animate labels graphs from previous state to new state (using shared utility)
	 */
	_animateLabelsGraphs() {
		if (!this.root) return;
		const cards = this.root.querySelectorAll(".turncard[data-actor-id]");
		for (const card of cards) {
			const actorId = card.dataset.actorId;
			if (!actorId) continue;
			animateGraphFromSavedState(`turncard-${actorId}`, card as HTMLElement);
		}
	},
};

// ────────────────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────────────────

// Register query handlers during init (before ready)
Hooks.once("init", () => {
	registerQueryHandlers();

	// Register Handlebars helper for equality comparison in templates
	Handlebars.registerHelper("eq", function (a, b) {
		return a === b;
	});
});

Hooks.once("ready", () => {
	try {
		registerSocketHandler();
		TurnCardsHUD.mount();
	} catch (e) {
		console.error(`[${NS}] Failed to initialize TurnCardsHUD`, e);
	}
});

// ────────────────────────────────────────────────────────────────────────────
// Exports for external usage (e.g., actor sheet shift labels, call sheets)
// ────────────────────────────────────────────────────────────────────────────
export { promptShiftLabels, applyShiftLabels };

// Export cooldown system and team utilities for call sheets
export { CooldownSystem, getTeamCombatants, getActiveCombat };
