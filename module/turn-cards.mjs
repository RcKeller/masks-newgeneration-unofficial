// module/turn-cards.mjs
// Turn Cards HUD + cooldown throttle + Team + Aid/Forward + Potential
/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, ContextMenu */

import {
	normalize,
	candidateTokenNames,
	compositeKey,
	InfluenceIndex,
} from "./helpers/influence.mjs";

(() => {
	const NS = "masks-newgeneration-unofficial";
	const SOCKET_NS = `module.${NS}`;
	const TEMPLATE = `modules/${NS}/templates/turncards.hbs`;

	// ────────────────────────────────────────────────────────────────────────────
	// Flags (NEW cooldown system)
	// ────────────────────────────────────────────────────────────────────────────
	const FLAG_COOLDOWN = "turnCardsCooldownRemaining"; // Combatant flag: integer >= 0
	const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential"; // Actor flag fallback

	// Constants
	const POTENTIAL_MAX = 5;
	const AID_MOVE_UUID =
		"@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}";
	const LABEL_KEYS = Object.freeze([
		"danger",
		"freak",
		"savior",
		"superior",
		"mundane",
	]);

	// Prevent spam double-clicking
	const pendingOps = new Set();

	// ────────────────────────────────────────────────────────────────────────────
	// Utils
	// ────────────────────────────────────────────────────────────────────────────
	const isGM = () => game.user?.isGM === true;
	const hasActiveGM = () =>
		(game.users?.contents ?? []).some((u) => u?.isGM && u?.active);
	const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));
	const getProp = (obj, path) => foundry.utils.getProperty(obj, path);
	const clampInt = (n, lo, hi) =>
		Math.min(hi, Math.max(lo, Math.floor(Number(n) || 0)));

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
		const tok = (canvas?.tokens?.placeables ?? []).find((t) => t?.actor?.isOwner);
		return tok?.actor ?? null;
	}

	function getTokenForActor(actor) {
		if (!actor) return null;
		return (
			(canvas?.tokens?.placeables ?? []).find((t) => t?.actor?.id === actor.id) ||
			null
		);
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
			// Deduplicate in case of weird multi-token/multi-combatant situations.
			if (seenActorIds.has(a.id)) continue;
			seenActorIds.add(a.id);
			out.push(cbt);
		}
		return out;
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Team Service (Journal-backed) + lightweight socket sync
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
			// Update cache if we can see the doc
			const v = Number(this._doc?.getFlag?.(NS, "team"));
			if (Number.isFinite(v)) this._cache = Math.max(0, Math.floor(v));
		},

		async ensureReady() {
			// GM makes sure the Team doc exists and is visible to players
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
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsTeamSyncRequest",
					userId: game.user?.id,
				});
			} catch (_) {
				/* no-op */
			}
		},

		_broadcast(value, toUserId = null) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsTeamSync",
					value,
					toUserId,
				});
			} catch (_) {
				/* no-op */
			}
		},

		get canEdit() {
			return (
				isGM() || (game.settings.get(NS, "playersCanEdit") && this._doc?.isOwner)
			);
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

		async set(
			n,
			{ announce = true, delta = null, reason = null, actorName = null } = {}
		) {
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
				const from = game.user?.name ?? "Player";

				let content;
				if (reason === "aid" && actorName) {
					content = `<b>${escape(from)}</b> spends 1 Team to aid <b>${escape(
						actorName
					)}</b>!<br/>Team Pool: ${old} → <b>${n}</b>`;
				} else {
					content = `<b>Team Pool</b>: ${old} → <b>${n}</b> (${sign}${d}) <span class="color-muted">— ${escape(
						from
					)}</span>`;
				}
				await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
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

	async function setPotential(actor, delta) {
		const cur = getPotential(actor);
		const next = clampInt(cur + delta, 0, POTENTIAL_MAX);
		if (next === cur) return;

		if (canEditActor(actor)) {
			await setPotentialDirect(actor, next);
			return;
		}

		if (!hasActiveGM()) {
			ui.notifications?.warn?.("GM must be online to change Potential.");
			return;
		}

		game.socket?.emit(SOCKET_NS, {
			action: "turnCardsPotentialChange",
			actorId: actor.id,
			delta,
			userId: game.user?.id,
		});
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Forward / Ongoing / Aid
	// ────────────────────────────────────────────────────────────────────────────
	const getForward = (actor) =>
		Number(getProp(actor, "system.resources.forward.value")) || 0;
	const getOngoing = (actor) =>
		Number(getProp(actor, "system.resources.ongoing.value")) || 0;

	async function adjustForward(
		actor,
		delta,
		{ announce = true, includeAidLink = false, byUser = null } = {}
	) {
		if (!actor) return;

		const cur = getForward(actor);
		const next = Math.max(0, cur + delta);
		if (next === cur) return;

		await actor.update({ "system.resources.forward.value": next });

		if (announce) {
			const sign = delta > 0 ? "+" : "";
			const who = byUser?.name ?? game.user?.name ?? "Player";
			const aid = includeAidLink ? `<br/>${AID_MOVE_UUID}` : "";
			const content = `<b>${escape(who)}</b>: <b>${escape(
				actor.name
			)}</b> Forward ${cur} → <b>${next}</b> (${sign}${delta})${aid}`;
			await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
		}
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Label Shifting (kept; small cleanup)
	// ────────────────────────────────────────────────────────────────────────────
	function shiftBounds() {
		const min = Number(game.pbta?.sheetConfig?.minMod);
		const max = Number(game.pbta?.sheetConfig?.maxMod);
		return {
			lo: Number.isFinite(min) ? min : -2,
			hi: Number.isFinite(max) ? max : 3,
		};
	}

	function statLabel(actor, key) {
		return (
			getProp(actor, `system.stats.${key}.label`) ||
			game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ||
			key.charAt(0).toUpperCase() + key.slice(1)
		);
	}

	const getLabelValue = (actor, key) =>
		Number(getProp(actor, `system.stats.${key}.value`)) || 0;

	function getShiftableLabels(actor) {
		const { lo, hi } = shiftBounds();
		const up = [];
		const down = [];
		for (const k of LABEL_KEYS) {
			const v = getLabelValue(actor, k);
			if (v < hi) up.push(k);
			if (v > lo) down.push(k);
		}
		return { canShiftUp: up, canShiftDown: down };
	}

	async function promptShiftLabels(actor, title) {
		const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
		if (!canShiftUp.length || !canShiftDown.length) {
			ui.notifications?.warn?.("No valid label shifts.");
			return null;
		}

		const labels = LABEL_KEYS.map((k) => ({
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
					return `<option value="${l.key}" ${disabled ? "disabled" : ""}>${escape(
						l.label
					)} [${l.value}]${suf}</option>`;
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
								if (up === down)
									ui.notifications?.warn?.("Choose two different Labels.");
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
					if (upSel) upSel.value = canShiftUp[0] || LABEL_KEYS[0];
					if (downSel)
						downSel.value =
							canShiftDown.find((k) => k !== canShiftUp[0]) ||
							canShiftDown[0] ||
							LABEL_KEYS[1];
				},
			}).render(true);
		});
	}

	async function applyShiftLabels(
		actor,
		upKey,
		downKey,
		{ announce = true, reason = "shift", sourceActor = null } = {}
	) {
		const { lo, hi } = shiftBounds();
		const p = (k) => `system.stats.${k}.value`;
		const curUp = getLabelValue(actor, upKey);
		const curDown = getLabelValue(actor, downKey);

		if (curUp >= hi || curDown <= lo) {
			ui.notifications?.warn?.("Labels at limits.");
			return false;
		}

		await actor.update({ [p(upKey)]: curUp + 1, [p(downKey)]: curDown - 1 });

		if (announce) {
			const upLabel = statLabel(actor, upKey);
			const downLabel = statLabel(actor, downKey);
			const name = escape(actor.name);

			let content =
				reason === "useInfluence" && sourceActor
					? `<b>${escape(
							sourceActor.name
					  )}</b> uses Influence to shift <b>${name}</b>'s Labels: `
					: `<b>${name}</b> shifts their Labels: `;

			content += `<span class="shift up">+${escape(
				upLabel
			)}</span>, <span class="shift down">-${escape(downLabel)}</span>`;
			await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
		}

		return true;
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Influence (kept for context menu compatibility)
	// ────────────────────────────────────────────────────────────────────────────
	function readInfluences(actor) {
		return foundry.utils.deepClone(actor?.getFlag?.(NS, "influences") || []);
	}

	function pickStorageName(actor, token) {
		const cands = candidateTokenNames(actor, token);
		return cands[0] || actor?.name || token?.document?.name || "Unknown";
	}

	function ensureInfluenceEntry(arr, name) {
		const want = normalize(name);
		let idx = arr.findIndex((e) => normalize(e?.name) === want);
		if (idx >= 0) return { idx, obj: arr[idx] };
		const obj = {
			id: foundry.utils.randomID?.(16) ?? Math.random().toString(36).slice(2),
			name,
			hasInfluenceOver: false,
			haveInfluenceOver: false,
			locked: false,
		};
		arr.push(obj);
		return { idx: arr.length - 1, obj };
	}

	function mutateInfluenceSide(arr, name, which) {
		const { idx, obj } = ensureInfluenceEntry(arr, name);
		const prev = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };

		if (obj.locked && which !== "reset") {
			return { changed: false, prev, now: prev, pruned: false };
		}

		if (which === "gt") obj.haveInfluenceOver = true;
		else if (which === "lt") obj.hasInfluenceOver = true;
		else if (which === "eq") {
			obj.haveInfluenceOver = true;
			obj.hasInfluenceOver = true;
		} else {
			obj.haveInfluenceOver = false;
			obj.hasInfluenceOver = false;
		}

		let pruned = false;
		if (!obj.hasInfluenceOver && !obj.haveInfluenceOver && !obj.locked) {
			arr.splice(idx, 1);
			pruned = true;
		}

		return {
			changed:
				prev.has !== !!obj.hasInfluenceOver ||
				prev.have !== !!obj.haveInfluenceOver ||
				pruned,
			prev,
			now: { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver },
			pruned,
		};
	}

	function stateSymbol(e) {
		const out = !!e?.haveInfluenceOver,
			inn = !!e?.hasInfluenceOver;
		if (out && inn) return "⬌";
		if (out) return "⬆";
		if (inn) return "⬇";
		return "x";
	}

	async function writeInfluencesIfChanged(actor, before, after) {
		const eq =
			before.length === after.length &&
			before.every((a, i) => {
				const b = after[i];
				return (
					a &&
					b &&
					normalize(a.name) === normalize(b.name) &&
					!!a.hasInfluenceOver === !!b.hasInfluenceOver &&
					!!a.haveInfluenceOver === !!b.haveInfluenceOver &&
					!!a.locked === !!b.locked
				);
			});

		if (eq) return false;
		await actor.setFlag(NS, "influences", after);
		return true;
	}

	async function announceInfluenceChange(srcName, tgtName, beforeSym, afterSym) {
		if (!game.settings.get(NS, "announceInfluenceChanges")) return;

		const badge = (s) => {
			const css =
				"display:inline-block;padding:0 .35rem;border-radius:.25rem;font-weight:700;";
			if (s === "⬆")
				return `<span style="${css}background:#4CAF50;color:#fff">${s}</span>`;
			if (s === "⬇")
				return `<span style="${css}background:#9C27B0;color:#fff">${s}</span>`;
			if (s === "⬌")
				return `<span style="${css}background:#2196F3;color:#fff">${s}</span>`;
			return `<span style="${css}background:#F44336;color:#fff">${s}</span>`;
		};

		let title;
		switch (afterSym) {
			case "⬆":
				title = `${srcName} gains Influence over ${tgtName}`;
				break;
			case "⬇":
				title = `${srcName} gives Influence to ${tgtName}`;
				break;
			case "⬌":
				title = `${srcName} and ${tgtName} share Influence`;
				break;
			default:
				title = `${srcName} and ${tgtName} do not share Influence`;
		}

		let content = `<h6>${badge(afterSym)} ${title}</h6>`;
		if (beforeSym !== "x" && beforeSym !== afterSym) {
			content += `<b>Previous:</b> <em>${srcName}</em> ${badge(
				beforeSym
			)} <em>${tgtName}</em>`;
		}

		await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
	}

	async function applyInfluencePair({ actorA, tokA, actorB, tokB, directive }) {
		if (
			!actorA ||
			!actorB ||
			actorA.type !== "character" ||
			actorB.type !== "character"
		) {
			ui.notifications?.warn?.("Influence actions are for Character ↔ Character.");
			return;
		}

		const aBefore = readInfluences(actorA);
		const bBefore = readInfluences(actorB);
		const aAfter = foundry.utils.deepClone(aBefore);
		const bAfter = foundry.utils.deepClone(bBefore);

		const nameAforB = pickStorageName(actorA, tokA);
		const nameBforA = pickStorageName(actorB, tokB);

		const stA = mutateInfluenceSide(aAfter, nameBforA, directive);
		const aPrevSym = stateSymbol({
			hasInfluenceOver: stA.prev.has,
			haveInfluenceOver: stA.prev.have,
		});
		const aNowSym = stateSymbol({
			hasInfluenceOver: stA.now.has,
			haveInfluenceOver: stA.now.have,
		});

		let whichB = "reset";
		if (directive === "gt") whichB = "lt";
		else if (directive === "lt") whichB = "gt";
		else if (directive === "eq") whichB = "eq";

		mutateInfluenceSide(bAfter, nameAforB, whichB);

		const tasks = [];
		if (canEditActor(actorA))
			tasks.push(writeInfluencesIfChanged(actorA, aBefore, aAfter));
		if (canEditActor(actorB))
			tasks.push(writeInfluencesIfChanged(actorB, bBefore, bAfter));
		await Promise.all(tasks);

		try {
			await InfluenceIndex?.syncCharacterPairFlags?.(actorA);
		} catch (_) {
			/* no-op */
		}

		await announceInfluenceChange(
			actorA.name ?? nameAforB,
			nameBforA,
			aPrevSym,
			aNowSym
		);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// NEW COOLDOWN SYSTEM (tear-down + reimplementation)
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

		/**
		 * GM-only: apply a "turn taken" tick.
		 * - If actingCombatantId is provided: acting gets cooldown=maxCd, everyone else ticks down by 1.
		 * - If null: everyone ticks down by 1 (GM/NPC turn).
		 */
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

				// Only update if changed OR we need to clamp legacy/out-of-range values
				if (next !== old) {
					updates.push({ _id: cbt.id, [`flags.${NS}.${FLAG_COOLDOWN}`]: next });
				}
			}

			if (updates.length) {
				await combat.updateEmbeddedDocuments("Combatant", updates);
			}
		},

		async gmAnnounceTurn(combat, actingCombatantId = null) {
			if (!combat) return;
			if (actingCombatantId) {
				const cbt = combat.combatants?.get?.(actingCombatantId);
				const name = cbt?.actor?.name ?? cbt?.name ?? "Unknown";
				await ChatMessage.create({
					content: `<b>${escape(name)}</b> takes action!`,
					type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				});
			} else {
				await ChatMessage.create({
					content: `<b>GM/NPC</b> takes action!`,
					type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				});
			}
		},

		async requestTakeTurn(combat, cbt) {
			if (!combat || !cbt) return;

			// Visible guard (avoid double click)
			const opKey = `turn-${combat.id}-${cbt.id}`;
			if (pendingOps.has(opKey)) return;
			pendingOps.add(opKey);
			setTimeout(() => pendingOps.delete(opKey), 1500);

			// Only own actor or GM
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
			const maxCd = this.maxCooldown(team.length);
			const rem = this.remaining(cbt, maxCd);

			if (rem > 0) {
				ui.notifications?.warn?.(`Still on cooldown (${rem} more turn(s)).`);
				return;
			}

			if (isGM()) {
				await this.gmApplyTurn(combat, cbt.id);
				await this.gmAnnounceTurn(combat, cbt.id);
				return;
			}

			if (!hasActiveGM()) {
				ui.notifications?.warn?.("GM must be online to register actions.");
				return;
			}

			game.socket?.emit(SOCKET_NS, {
				action: "turnCardsMarkAction",
				combatId: combat.id,
				combatantId: cbt.id,
				userId: game.user?.id,
			});
		},

		async requestGmTick(combat) {
			if (!combat) return;
			if (!isGM()) return;

			const opKey = `gmtick-${combat.id}`;
			if (pendingOps.has(opKey)) return;
			pendingOps.add(opKey);
			setTimeout(() => pendingOps.delete(opKey), 1000);

			await this.gmApplyTurn(combat, null);
			await this.gmAnnounceTurn(combat, null);
		},
	};

	// ────────────────────────────────────────────────────────────────────────────
	// Socket Relay (GM relay + Team sync)
	// ────────────────────────────────────────────────────────────────────────────
	const SocketRelay = {
		_registered: false,

		register() {
			if (this._registered) return;
			this._registered = true;

			try {
				game.socket?.on(SOCKET_NS, async (data) => {
					if (!data?.action) return;

					// Everyone can receive Team sync broadcasts.
					if (data.action === "turnCardsTeamSync") {
						const to = data.toUserId;
						if (!to || to === game.user?.id) {
							const v = Number(data.value);
							if (Number.isFinite(v)) TeamService._cache = Math.max(0, Math.floor(v));
							TurnCardsHUD._queueRender();
						}
						return;
					}

					// Ignore anything that isn't ours (other module features share this socket)
					const ours = new Set([
						"turnCardsTeamSyncRequest",
						"turnCardsMarkAction",
						"turnCardsGmTurn",
						"turnCardsAidTeammate",
						"turnCardsTeamChange",
						"turnCardsShiftLabels",
						"turnCardsPotentialChange",
						"turnCardsForwardChange",
					]);
					if (!ours.has(data.action)) return;

					// GM-only handlers below
					if (!isGM()) return;

					switch (data.action) {
						case "turnCardsTeamSyncRequest": {
							await TeamService.init();
							TeamService._broadcast(TeamService.value, data.userId ?? null);
							break;
						}

						case "turnCardsMarkAction": {
							const combat = game.combats?.get?.(data.combatId) ?? getActiveCombat();
							const cbt = combat?.combatants?.get?.(data.combatantId);
							const user = game.users?.get?.(data.userId);
							if (!combat || !cbt || !user) return;

							// Ownership check to prevent griefing
							if (!userOwnsActor(user, cbt.actor)) return;

							await CooldownSystem.gmApplyTurn(combat, cbt.id);
							await CooldownSystem.gmAnnounceTurn(combat, cbt.id);
							break;
						}

						case "turnCardsGmTurn": {
							const combat = game.combats?.get?.(data.combatId) ?? getActiveCombat();
							if (!combat) return;
							await CooldownSystem.gmApplyTurn(combat, null);
							await CooldownSystem.gmAnnounceTurn(combat, null);
							break;
						}

						case "turnCardsAidTeammate": {
							const target = game.actors?.get?.(data.targetActorId);
							const sourceUser = game.users?.get?.(data.sourceUserId);
							if (!target || !sourceUser) return;

							// Only applies to characters
							if (target.type !== "character") return;

							await TeamService.ensureReady();
							await TeamService.init();

							// Ensure target isn't downed (in active combat if present)
							const combat = getActiveCombat();
							const cbt = combat
								? getTeamCombatants(combat).find((c) => c.actor?.id === target.id)
								: null;
							if (cbt && isDowned(cbt)) {
								await ChatMessage.create({
									content: `Aid failed: <b>${escape(target.name)}</b> is Downed.`,
									type: CONST.CHAT_MESSAGE_TYPES.OTHER,
									whisper: [sourceUser.id],
								});
								return;
							}

							const teamOld = TeamService.value;
							if (teamOld < 1) {
								await ChatMessage.create({
									content: `Aid failed: Not enough <b>Team</b>.`,
									type: CONST.CHAT_MESSAGE_TYPES.OTHER,
									whisper: [sourceUser.id],
								});
								return;
							}

							// Spend 1 team (NO separate team announce; we emit one combined message)
							const teamRes = await TeamService.set(teamOld - 1, {
								announce: false,
								delta: -1,
							});
							if (!teamRes.ok) {
								await ChatMessage.create({
									content: `Aid failed: could not spend Team.`,
									type: CONST.CHAT_MESSAGE_TYPES.OTHER,
									whisper: [sourceUser.id],
								});
								return;
							}

							// Apply +1 Forward
							const fwdBefore = getForward(target);
							await target.update({ "system.resources.forward.value": fwdBefore + 1 });

							const content = `<b>${escape(
								sourceUser.name
							)}</b> spends <b>1 Team</b> to aid <b>${escape(target.name)}</b>!<br/>
Team Pool: ${teamOld} → <b>${teamOld - 1}</b><br/>
<b>${escape(target.name)}</b> gains <b>+1 Forward</b> (now ${
								fwdBefore + 1
							}).<br/>
${AID_MOVE_UUID}`;

							await ChatMessage.create({
								content,
								type: CONST.CHAT_MESSAGE_TYPES.OTHER,
							});
							break;
						}

						case "turnCardsTeamChange": {
							const delta = Number(data.delta) || 0;
							if (!delta) return;
							await TeamService.ensureReady();
							await TeamService.init();
							await TeamService.change(delta);
							break;
						}

						case "turnCardsShiftLabels": {
							const target = game.actors?.get?.(data.targetActorId);
							if (!target || !data.up || !data.down) return;

							let sourceActor = null;
							if (data.reason === "useInfluence" && data.sourceActorId) {
								sourceActor = game.actors?.get?.(data.sourceActorId);
								if (!sourceActor) return;
								if (
									!InfluenceIndex.hasEdgeFromKeyToKey(
										compositeKey(sourceActor),
										compositeKey(target)
									)
								)
									return;
							}

							await applyShiftLabels(target, data.up, data.down, {
								announce: true,
								reason: data.reason ?? "shift",
								sourceActor,
							});
							break;
						}

						case "turnCardsPotentialChange": {
							const actor = game.actors?.get?.(data.actorId);
							const user = game.users?.get?.(data.userId);
							if (!actor || !user) return;
							if (!userOwnsActor(user, actor)) return;

							const cur = getPotential(actor);
							const next = clampInt(cur + Number(data.delta || 0), 0, POTENTIAL_MAX);
							if (next !== cur) await setPotentialDirect(actor, next);
							break;
						}

						case "turnCardsForwardChange": {
							const actor = game.actors?.get?.(data.actorId);
							const user = game.users?.get?.(data.userId);
							if (!actor || !user) return;
							if (!userOwnsActor(user, actor)) return;

							const delta = Number(data.delta || 0);
							await adjustForward(actor, delta, {
								announce: true,
								includeAidLink: false,
								byUser: user,
							});
							break;
						}
					}
				});
			} catch (e) {
				console.warn(`[${NS}] Socket unavailable`, e);
			}
		},
	};

	// ────────────────────────────────────────────────────────────────────────────
	// Turn Cards HUD
	// ────────────────────────────────────────────────────────────────────────────
	const TurnCardsHUD = {
		root: null,
		_hooksRegistered: false,
		_contextMenu: null,
		_renderQueued: false,
		_lastCooldownFrac: new Map(), // combatantId -> number (0..1)

		mount() {
			const host =
				document.querySelector("#ui-middle #ui-bottom") ||
				document.querySelector("#ui-bottom") ||
				document.querySelector("#ui-middle") ||
				document.body;

			this.root?.remove();
			this.root = document.createElement("section");
			this.root.id = "masks-turncards";
			this.root.setAttribute("role", "group");
			this.root.setAttribute("aria-label", "Team Turn Cards");
			host.appendChild(this.root);

			this._bindEvents();
			this._registerHooks();

			// Ensure Team doc exists (GM) + warm caches.
			TeamService.ensureReady().then(() => TeamService.init());
			// Players request a team sync in case they cannot see the journal doc.
			TeamService.requestSync();

			this._queueRender();
		},

		_bindEvents() {
			if (!this.root || this.root.dataset.bound === "1") return;
			this.root.dataset.bound = "1";

			this.root.addEventListener(
				"click",
				(ev) => {
					this._onClick(ev);
				},
				{ capture: true }
			);

			this.root.addEventListener(
				"contextmenu",
				(ev) => {
					this._onRightClick(ev);
				},
				{ capture: true }
			);

			this.root.addEventListener("keydown", (ev) => {
				if (ev.key === "Enter" || ev.key === " ") {
					const card = ev.target?.closest?.(
						".turncard[data-combatant-id]:not(.turncard--team)"
					);
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

			const card = target.closest(
				".turncard[data-combatant-id]:not(.turncard--team)"
			);
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
					if (!combat) return;
					// GM-only tick
					await CooldownSystem.requestGmTick(combat);
					break;
				}

				case "card-action": {
					const combat = getActiveCombat();
					if (!combat) return;
					const cbt = combat.combatants?.get?.(el.dataset.combatantId);
					if (!cbt) return;
					await CooldownSystem.requestTakeTurn(combat, cbt);
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
					if (isGM() || TeamService.canEdit) await TeamService.set(0);
					else ui.notifications?.warn?.("No permission to reset Team.");
					break;
			}
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

			await setPotential(actor, delta);

			// Visual bump feedback
			el.classList.remove("is-bump");
			void el.offsetHeight;
			el.classList.add("is-bump");
		},

		async _handleForward(el, delta) {
			const targetActor = game.actors?.get?.(el.dataset.actorId);
			if (!targetActor) return;

			const myActor = getMyActor();
			const isSelf = myActor && myActor.id === targetActor.id;

			// Remove forward: self or GM only
			if (delta < 0) {
				if (!isSelf && !isGM()) {
					ui.notifications?.warn?.("Can only remove Forward from yourself.");
					return;
				}

				if (canEditActor(targetActor)) {
					await adjustForward(targetActor, delta, {
						announce: true,
						includeAidLink: false,
					});
				} else if (hasActiveGM()) {
					game.socket?.emit(SOCKET_NS, {
						action: "turnCardsForwardChange",
						actorId: targetActor.id,
						delta,
						userId: game.user?.id,
					});
				} else {
					ui.notifications?.warn?.("GM must be online to remove Forward.");
				}
				return;
			}

			// Add forward:
			// - GM: can add to anyone anytime, no team cost
			// - Player (self): add to self, no team cost
			// - Player (other): Aid, costs 1 Team, disabled if team=0 or target downed
			if (isGM() || isSelf) {
				// Free +1 forward
				if (canEditActor(targetActor)) {
					await adjustForward(targetActor, +1, {
						announce: true,
						includeAidLink: false,
					});
				} else if (hasActiveGM()) {
					// If somehow lacking permission locally, GM relay
					game.socket?.emit(SOCKET_NS, {
						action: "turnCardsForwardChange",
						actorId: targetActor.id,
						delta: +1,
						userId: game.user?.id,
					});
				} else {
					ui.notifications?.warn?.("GM must be online to add Forward.");
				}
				return;
			}

			// Aid path (player aiding someone else)
			const combat = getActiveCombat();
			const teamValue = TeamService.value;

			const targetCbt = combat
				? getTeamCombatants(combat).find((c) => c.actor?.id === targetActor.id)
				: null;
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

			game.socket?.emit(SOCKET_NS, {
				action: "turnCardsAidTeammate",
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
				await applyShiftLabels(actor, picked.up, picked.down, {
					announce: true,
					reason: "shift",
				});
			} else if (hasActiveGM()) {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsShiftLabels",
					targetActorId: actor.id,
					up: picked.up,
					down: picked.down,
					reason: "shift",
				});
			} else {
				ui.notifications?.warn?.("A GM must be online.");
			}
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

			game.socket?.emit(SOCKET_NS, { action: "turnCardsTeamChange", delta });
		},

		_registerHooks() {
			if (this._hooksRegistered) return;
			this._hooksRegistered = true;

			Hooks.on("createCombat", () => this._queueRender());
			Hooks.on("deleteCombat", () => this._queueRender());

			Hooks.on("updateCombat", () => this._queueRender());
			Hooks.on("createCombatant", () => this._queueRender());
			Hooks.on("deleteCombatant", () => this._queueRender());

			Hooks.on("updateCombatant", (doc, changes) => {
				const active = getActiveCombat();
				if (!active || doc?.combat?.id !== active.id) return;

				// Re-render if anything relevant changed.
				const flat = foundry.utils.flattenObject(changes ?? {});
				const keys = Object.keys(flat);
				const wants = [
					"defeated",
					`flags.${NS}.${FLAG_COOLDOWN}`,
					"hidden", // in case GM hides tokens/combats
				];
				if (keys.some((k) => wants.some((w) => k === w || k.startsWith(w))))
					this._queueRender();
			});

			Hooks.on("updateActor", (_actor, changes) => {
				const flat = foundry.utils.flattenObject(changes ?? {});
				const keys = Object.keys(flat);
				const wants = [
					"system.attributes.xp.value",
					"system.resources.forward.value",
					"system.resources.ongoing.value",
					"system.attributes.hp.value",
					"system.stats",
					`flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`,
					"img",
					"name",
				];
				if (keys.some((k) => wants.some((w) => k === w || k.startsWith(w))))
					this._queueRender();
			});

			Hooks.on("updateJournalEntry", (doc) => {
				if (TeamService._doc && doc.id === TeamService._doc.id) this._queueRender();
			});

			Hooks.on("canvasReady", () => {
				if (!document.getElementById("masks-turncards")) this.mount();
				else this._queueRender();
			});

			Hooks.on("masksTeamUpdated", () => this._queueRender());
		},

		_queueRender() {
			if (this._renderQueued) return;
			this._renderQueued = true;

			setTimeout(async () => {
				try {
					await this.render();
				} finally {
					this._renderQueued = false;
				}
			}, 10);
		},

		_setupContextMenu() {
			const $ = globalThis.jQuery ?? globalThis.$;
			if (!$ || !this.root) return;

			if (this._contextMenu) {
				try {
					this._contextMenu.close?.();
				} catch (_) {
					/* ignore */
				}
				this._contextMenu = null;
			}

			const items = [
				{
					name: "Gain Influence over",
					icon: '<i class="fa-solid fa-up"></i>',
					callback: (li) => this._ctxInfluence(li, "gt"),
				},
				{
					name: "Gain Synergy (mutual)",
					icon: '<i class="fa-solid fa-left-right"></i>',
					callback: (li) => this._ctxInfluence(li, "eq"),
				},
				{
					name: "Give Influence to",
					icon: '<i class="fa-solid fa-down"></i>',
					callback: (li) => this._ctxInfluence(li, "lt"),
				},
				{
					name: "Use Influence against…",
					icon: '<i class="fa-solid fa-bullseye"></i>',
					callback: (li) => this._ctxUseInfluence(li),
				},
			];

			try {
				this._contextMenu = new ContextMenu(
					$(this.root),
					".turncard[data-actor-id]:not(.turncard--team)",
					items
				);
			} catch (e) {
				console.warn(`[${NS}] ContextMenu failed`, e);
			}
		},

		_liEl(li) {
			if (!li) return null;
			if (li instanceof HTMLElement) return li;
			if (Array.isArray(li) && li[0] instanceof HTMLElement) return li[0];
			return li?.[0] instanceof HTMLElement ? li[0] : null;
		},

		async _resolveSource() {
			const ctrl = canvas?.tokens?.controlled ?? [];
			if (ctrl.length === 1 && ctrl[0]?.actor)
				return { token: ctrl[0], actor: ctrl[0].actor };

			const my = game.user?.character;
			if (my) return { token: getTokenForActor(my), actor: my };

			const owned = (canvas?.tokens?.placeables ?? []).find(
				(t) => t.actor?.isOwner
			);
			if (owned) return { token: owned, actor: owned.actor };

			ui.notifications?.warn?.(
				"Select your character token or set User Character."
			);
			return null;
		},

		async _ctxInfluence(li, directive) {
			const el = this._liEl(li);
			const targetActorId = el?.dataset?.actorId;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveSource();
			if (!src?.actor || src.actor.id === targetActor.id) {
				ui.notifications?.warn?.("Pick another card.");
				return;
			}

			const tgtTok = getTokenForActor(targetActor);
			await applyInfluencePair({
				actorA: src.actor,
				tokA: src.token,
				actorB: targetActor,
				tokB: tgtTok,
				directive,
			});
		},

		async _ctxUseInfluence(li) {
			const el = this._liEl(li);
			const targetActorId = el?.dataset?.actorId;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveSource();
			if (!src?.actor || src.actor.id === targetActor.id) {
				ui.notifications?.warn?.("Can't use Influence against yourself.");
				return;
			}

			if (
				!InfluenceIndex.hasEdgeFromKeyToKey(
					compositeKey(src.actor),
					compositeKey(targetActor)
				)
			) {
				ui.notifications?.warn?.(`No Influence over ${targetActor.name}.`);
				return;
			}

			const picked = await promptShiftLabels(
				targetActor,
				`Use Influence on: ${targetActor.name}`
			);
			if (!picked) return;

			if (canEditActor(targetActor)) {
				await applyShiftLabels(targetActor, picked.up, picked.down, {
					announce: true,
					reason: "useInfluence",
					sourceActor: src.actor,
				});
			} else if (hasActiveGM()) {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsShiftLabels",
					targetActorId: targetActor.id,
					sourceActorId: src.actor.id,
					up: picked.up,
					down: picked.down,
					reason: "useInfluence",
				});
			} else {
				ui.notifications?.warn?.("A GM must be online.");
			}
		},

		_applyCooldownBarTransitions() {
			if (!this.root) return;
			const bars = this.root.querySelectorAll(
				".turncard__cooldown-bar[data-cooldown-frac]"
			);
			requestAnimationFrame(() => {
				for (const bar of bars) {
					const n = Number(bar.getAttribute("data-cooldown-frac"));
					if (!Number.isFinite(n)) continue;
					bar.style.setProperty(
						"--cooldown-frac",
						String(Math.max(0, Math.min(1, n)))
					);
				}
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
				const potentialPct =
					POTENTIAL_MAX > 0
						? `${Math.round((potential / POTENTIAL_MAX) * 100)}%`
						: "0%";

				const forward = getForward(actor);
				const ongoing = getOngoing(actor);
				const effectiveBonus = forward + ongoing;

				const status = downed ? "down" : onCooldown ? "busy" : "ready";

				// Aid availability (player aiding someone else)
				const canAid = !isSelf && !isGM() && !downed && teamValue >= 1;
				const forwardDisabled = !isSelf && !isGM() && !canAid;

				const showActionBtn = status === "ready" && (isGM() || isSelf);
				const statusTooltip = onCooldown
					? `Cooldown: ${rem} turn(s) remaining`
					: "";

				const forwardTooltip =
					isGM() || isSelf
						? `Forward: ${forward} | Ongoing: ${ongoing} (Click +1, Right-click -1)`
						: canAid
						? `Aid ${actor.name}: Spend 1 Team`
						: downed
						? "Cannot aid (Downed)"
						: "Cannot aid (No Team)";

				return {
					combatantId: cbt.id,
					actorId: actor.id,
					name: actor.name ?? "UNKNOWN",
					img: actor.img ?? "",
					ariaLabel: [
						actor.name,
						downed ? "Downed" : null,
						onCooldown ? `Cooldown (${rem})` : "Ready",
						`Potential ${potential}/${POTENTIAL_MAX}`,
					]
						.filter(Boolean)
						.join(", "),
					downed,
					downedId: downed ? `turncard-downed-${cbt.id}` : null,

					onCooldown,
					cooldownFrac: fracStart.toFixed(3), // start width (previous)
					cooldownFracTarget: fracTarget.toFixed(3), // animate-to width
					remaining: rem,

					potential,
					potentialPct,
					potentialMax: POTENTIAL_MAX,
					canEditPotential: isSelf || isGM(),

					forward,
					ongoing,
					effectiveBonus,
					hasBonus: effectiveBonus > 0,
					forwardDisabled,
					forwardTooltip,

					status,
					statusTooltip,
					showActionBtn,
					actionAria: showActionBtn ? `Take action as ${actor.name}` : "",
					canShiftLabels: isSelf || isGM(),
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

			const html = await renderTemplate(TEMPLATE, context);
			this.root.innerHTML = html;

			this._applyCooldownBarTransitions();
			this._setupContextMenu();
		},
	};

	// ────────────────────────────────────────────────────────────────────────────
	// Initialization
	// ────────────────────────────────────────────────────────────────────────────
	Hooks.once("ready", () => {
		try {
			SocketRelay.register();
			TurnCardsHUD.mount();
		} catch (e) {
			console.error(`[${NS}] Failed to initialize TurnCardsHUD`, e);
		}
	});
})();
