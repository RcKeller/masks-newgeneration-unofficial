// module/turn-cards.mjs
/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, ContextMenu */

import {
	normalize,
	candidateTokenNames,
	compositeKey,
	InfluenceIndex,
} from "./helpers/influence.mjs";

/**
 * masks-newgeneration-unofficial / turn-cards.mjs
 * ----------------------------------------------------------------------------
 * Team Turn Cards HUD - Revised Implementation v4
 *
 * Features:
 * - Shows playable Characters (actor.type === "character") in the active Combat
 * - Cooldown system: can't act again until cooldown depletes to 0
 * - Team pool integration with +/- controls
 * - Potential (XP) tracking via star icon
 * - Shift Labels via circle icon (with chat announcements)
 * - Forward/Ongoing display and controls
 * - Aid teammate functionality (spend team to give +1 forward)
 * - Context menu for Influence actions
 * - Proper permission handling for GMs and players
 */

(() => {
	const NS = "masks-newgeneration-unofficial";
	const SOCKET_NS = "module.masks-newgeneration-unofficial";

	// Combat flag: cooldown remaining turns by combatant id
	const FLAG_COOLDOWN_MAP = "turnCardsCooldownMap";

	// Actor fallback flag for potential if the sheet doesn't have system.attributes.xp
	const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential";

	const POTENTIAL_MAX = 5;

	// Influence settings (already registered by tools.mjs)
	const KEY_ANNOUNCE_INFLUENCE = "announceInfluenceChanges";
	const KEY_USE_GM_INFLUENCE = "quickInfluenceUseGMRelay";

	const LABEL_KEYS = Object.freeze([
		"danger",
		"freak",
		"savior",
		"superior",
		"mundane",
	]);

	/**
	 * Clamp a number to an integer within [lo, hi].
	 */
	const clampInt = (n, lo, hi) => {
		const x = Number(n);
		if (!Number.isFinite(x)) return lo;
		return Math.min(hi, Math.max(lo, Math.floor(x)));
	};

	function getActiveCombat() {
		return game.combats?.active ?? ui.combat?.viewed ?? null;
	}

	function getTeamCombatants(combat) {
		const list = combat?.combatants?.contents ?? combat?.combatants ?? [];
		return Array.from(list).filter((cbt) => {
			const a = cbt?.actor;
			return !!a && a.type === "character";
		});
	}

	function canEditCombatant(cbt) {
		return game.user?.isGM || cbt?.isOwner === true;
	}

	function canEditActor(actor) {
		return game.user?.isGM || actor?.isOwner === true;
	}

	function hasAnyActiveGM() {
		const users = game.users?.contents ?? game.users ?? [];
		return users.some((u) => u?.isGM && u?.active);
	}

	function actorPotentialValue(actor) {
		const xpVal = Number(
			foundry?.utils?.getProperty?.(actor, "system.attributes.xp.value")
		);
		if (Number.isFinite(xpVal)) return clampInt(xpVal, 0, POTENTIAL_MAX);

		const flagVal = Number(actor?.getFlag?.(NS, FLAG_POTENTIAL_FALLBACK));
		if (Number.isFinite(flagVal)) return clampInt(flagVal, 0, POTENTIAL_MAX);

		return 0;
	}

	async function setActorPotential(actor, nextVal) {
		const v = clampInt(nextVal, 0, POTENTIAL_MAX);
		if (!actor) return;

		const hasXpPath =
			foundry?.utils?.getProperty?.(actor, "system.attributes.xp") !== undefined;
		try {
			if (hasXpPath) {
				await actor.update({ "system.attributes.xp.value": v });
			} else {
				await actor.setFlag(NS, FLAG_POTENTIAL_FALLBACK, v);
			}
		} catch (err) {
			console.error(`[${NS}] Failed to set potential for ${actor?.name}`, err);
			ui.notifications?.warn?.(
				"You don't have permission to change that character's Potential."
			);
		}
	}

	function getActorForward(actor) {
		const v = Number(
			foundry?.utils?.getProperty?.(actor, "system.resources.forward.value")
		);
		return Number.isFinite(v) ? v : 0;
	}

	function getActorOngoing(actor) {
		const v = Number(
			foundry?.utils?.getProperty?.(actor, "system.resources.ongoing.value")
		);
		return Number.isFinite(v) ? v : 0;
	}

	function isDowned(cbt) {
		const defeated = cbt?.defeated === true;
		const hp = Number(
			foundry?.utils?.getProperty?.(cbt?.actor, "system.attributes.hp.value")
		);
		const hpZero = Number.isFinite(hp) && hp <= 0;
		return defeated || hpZero;
	}

	function statLabel(actor, key) {
		return (
			foundry.utils.getProperty(actor, `system.stats.${key}.label`) ||
			game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ||
			key.charAt(0).toUpperCase() + key.slice(1)
		);
	}

	function shiftBounds() {
		const min = Number(game.pbta?.sheetConfig?.minMod);
		const max = Number(game.pbta?.sheetConfig?.maxMod);
		const lo = Number.isFinite(min) ? min : -2;
		const hi = Number.isFinite(max) ? max : 3;
		return { lo, hi };
	}

	function getActorLabelValue(actor, key) {
		const v = Number(
			foundry.utils.getProperty(actor, `system.stats.${key}.value`)
		);
		return Number.isFinite(v) ? v : 0;
	}

	/**
	 * Returns which labels can legally be shifted up or down
	 */
	function getShiftableLabels(actor) {
		const { lo, hi } = shiftBounds();
		const canShiftUp = [];
		const canShiftDown = [];

		for (const key of LABEL_KEYS) {
			const val = getActorLabelValue(actor, key);
			if (val < hi) canShiftUp.push(key);
			if (val > lo) canShiftDown.push(key);
		}

		return { canShiftUp, canShiftDown };
	}

	async function promptShiftLabels(actor, { title = null } = {}) {
		const { canShiftUp, canShiftDown } = getShiftableLabels(actor);

		if (canShiftUp.length === 0 || canShiftDown.length === 0) {
			ui.notifications?.warn?.("No valid label shifts available (all at limits).");
			return null;
		}

		const labels = LABEL_KEYS.map((k) => ({
			key: k,
			label: String(statLabel(actor, k)),
			value: getActorLabelValue(actor, k),
		}));

		const escape = (s) => foundry.utils.escapeHTML(String(s));
		const { lo, hi } = shiftBounds();

		const optsUp = labels
			.map((l) => {
				const disabled = !canShiftUp.includes(l.key);
				const atMax = l.value >= hi;
				const suffix = atMax ? ` (at max ${hi})` : "";
				return `<option value="${l.key}" ${disabled ? "disabled" : ""}>${escape(
					l.label
				)} [${l.value}]${suffix}</option>`;
			})
			.join("");

		const optsDown = labels
			.map((l) => {
				const disabled = !canShiftDown.includes(l.key);
				const atMin = l.value <= lo;
				const suffix = atMin ? ` (at min ${lo})` : "";
				return `<option value="${l.key}" ${disabled ? "disabled" : ""}>${escape(
					l.label
				)} [${l.value}]${suffix}</option>`;
			})
			.join("");

		// Find first valid defaults
		const defaultUp = canShiftUp[0] || LABEL_KEYS[0];
		const defaultDown =
			canShiftDown.find((k) => k !== defaultUp) ||
			canShiftDown[0] ||
			LABEL_KEYS[1];

		const content = `
			<form>
				<p style="margin:0 0 0.5rem 0;">Choose one Label to shift <b>up</b> and one to shift <b>down</b>.</p>
				<div class="form-group">
					<label>Shift up (+1):</label>
					<select name="up">${optsUp}</select>
				</div>
				<div class="form-group">
					<label>Shift down (-1):</label>
					<select name="down">${optsDown}</select>
				</div>
				<p class="notes" style="margin:0.35rem 0 0 0; opacity:0.8;">(They must be different.)</p>
			</form>
		`;

		return new Promise((resolve) => {
			new Dialog({
				title: title ?? `Shift Labels: ${actor?.name ?? "Character"}`,
				content,
				buttons: {
					ok: {
						label: "Shift",
						callback: (html) => {
							const root = html?.[0];
							const up = root?.querySelector("select[name='up']")?.value;
							const down = root?.querySelector("select[name='down']")?.value;
							if (!up || !down) return resolve(null);
							if (up === down) {
								ui.notifications?.warn?.("Choose two different Labels to shift.");
								return resolve(null);
							}
							// Validate they're actually legal
							if (!canShiftUp.includes(up)) {
								ui.notifications?.warn?.(
									`Cannot shift ${statLabel(actor, up)} up (already at max).`
								);
								return resolve(null);
							}
							if (!canShiftDown.includes(down)) {
								ui.notifications?.warn?.(
									`Cannot shift ${statLabel(actor, down)} down (already at min).`
								);
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
					// Set default selections
					const upSel = html[0]?.querySelector("select[name='up']");
					const downSel = html[0]?.querySelector("select[name='down']");
					if (upSel) upSel.value = defaultUp;
					if (downSel) downSel.value = defaultDown;
				},
			}).render(true);
		});
	}

	/**
	 * Apply label shifts and announce to chat
	 */
	async function applyShiftLabels(actor, upKey, downKey, options = {}) {
		const { announce = true, reason = "shift", sourceActor = null } = options;

		if (!actor) return false;
		const { lo, hi } = shiftBounds();

		const p = (k) => `system.stats.${k}.value`;
		const curUp = Number(foundry.utils.getProperty(actor, p(upKey)));
		const curDown = Number(foundry.utils.getProperty(actor, p(downKey)));

		if (!Number.isFinite(curUp) || !Number.isFinite(curDown)) {
			ui.notifications?.warn?.("This actor doesn't have a Labels track to shift.");
			return false;
		}

		// Validate bounds
		if (curUp >= hi) {
			ui.notifications?.warn?.(
				`${statLabel(actor, upKey)} is already at maximum (${hi}).`
			);
			return false;
		}
		if (curDown <= lo) {
			ui.notifications?.warn?.(
				`${statLabel(actor, downKey)} is already at minimum (${lo}).`
			);
			return false;
		}

		const nextUp = clampInt(curUp + 1, lo, hi);
		const nextDown = clampInt(curDown - 1, lo, hi);

		const updates = {};
		let actuallyShiftedUp = false;
		let actuallyShiftedDown = false;

		if (nextUp !== curUp) {
			updates[p(upKey)] = nextUp;
			actuallyShiftedUp = true;
		}
		if (nextDown !== curDown) {
			updates[p(downKey)] = nextDown;
			actuallyShiftedDown = true;
		}

		if (!Object.keys(updates).length) {
			ui.notifications?.info?.("No Labels changed (already at limits).");
			return false;
		}

		try {
			await actor.update(updates);
		} catch (err) {
			console.error(`[${NS}] Failed to shift labels for ${actor.name}`, err);
			ui.notifications?.error?.("Couldn't shift labels (see console).");
			return false;
		}

		// Announce to chat
		if (announce) {
			const upLabel = statLabel(actor, upKey);
			const downLabel = statLabel(actor, downKey);
			const actorName = foundry.utils.escapeHTML(actor.name ?? "Character");

			let content = "";

			if (reason === "useInfluence" && sourceActor) {
				const sourceName = foundry.utils.escapeHTML(sourceActor.name ?? "Someone");
				content = `<b>${sourceName}</b> uses Influence to shift <b>${actorName}</b>'s Labels: `;
			} else {
				content = `<b>${actorName}</b> shifts their Labels: `;
			}

			const parts = [];
			if (actuallyShiftedUp) {
				parts.push(
					`<span class="shift up">+${foundry.utils.escapeHTML(upLabel)}</span>`
				);
			}
			if (actuallyShiftedDown) {
				parts.push(
					`<span class="shift down">-${foundry.utils.escapeHTML(downLabel)}</span>`
				);
			}
			content += parts.join(", ");

			await ChatMessage.create({
				content,
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
			});
		}

		return true;
	}

	/* -------------------------- Influence helpers -------------------------- */

	function readInfluences(actor) {
		return foundry.utils.deepClone(actor.getFlag(NS, "influences") || []);
	}

	function pickStorageName(actor, token) {
		const cands = candidateTokenNames(actor, token);
		return cands[0] || actor?.name || token?.document?.name || "Unknown";
	}

	function ensureInfluenceEntry(arr, nameToMatch) {
		const want = normalize(nameToMatch);
		const idx = arr.findIndex((e) => normalize(e?.name) === want);
		if (idx >= 0) return { idx, obj: arr[idx] };

		const obj = {
			id: foundry.utils.randomID?.(16) ?? Math.random().toString(36).slice(2),
			name: nameToMatch,
			hasInfluenceOver: false,
			haveInfluenceOver: false,
			locked: false,
		};
		arr.push(obj);
		return { idx: arr.length - 1, obj };
	}

	function stateSymbol(e) {
		const out = !!e?.haveInfluenceOver;
		const inn = !!e?.hasInfluenceOver;
		if (out && inn) return "⬌";
		if (out) return "⬆";
		if (inn) return "⬇";
		return "x";
	}

	async function writeInfluencesIfChanged(actor, beforeArr, afterArr) {
		const sameLen = beforeArr.length === afterArr.length;
		let equal = sameLen;
		if (equal) {
			for (let i = 0; i < beforeArr.length; i++) {
				const a = beforeArr[i],
					b = afterArr[i];
				if (!a || !b) {
					equal = false;
					break;
				}
				if (
					normalize(a.name) !== normalize(b.name) ||
					!!a.hasInfluenceOver !== !!b.hasInfluenceOver ||
					!!a.haveInfluenceOver !== !!b.haveInfluenceOver ||
					!!a.locked !== !!b.locked
				) {
					equal = false;
					break;
				}
			}
		}
		if (equal) return false;

		await actor.setFlag(NS, "influences", afterArr);
		return true;
	}

	function mutateInfluenceSide(inflArr, counterpartyName, which) {
		const { idx, obj } = ensureInfluenceEntry(inflArr, counterpartyName);
		const prev = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };

		if (obj.locked === true && which !== "reset") {
			return { changed: false, prev, now: prev, pruned: false };
		}

		if (which === "gt") {
			obj.haveInfluenceOver = true;
		} else if (which === "lt") {
			obj.hasInfluenceOver = true;
		} else if (which === "eq") {
			obj.haveInfluenceOver = true;
			obj.hasInfluenceOver = true;
		} else if (which === "reset") {
			obj.haveInfluenceOver = false;
			obj.hasInfluenceOver = false;
		}

		let pruned = false;
		if (!obj.hasInfluenceOver && !obj.haveInfluenceOver && obj.locked !== true) {
			inflArr.splice(idx, 1);
			pruned = true;
		}

		const now = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };
		return {
			changed: prev.has !== now.has || prev.have !== now.have || pruned,
			prev,
			now,
			pruned,
		};
	}

	async function announceInfluenceChange(srcName, tgtName, beforeSym, afterSym) {
		if (!game.settings.get(NS, KEY_ANNOUNCE_INFLUENCE)) return;

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

		let title = "Influence Change";
		switch (afterSym) {
			case "⬆":
				title = `${srcName} gains Influence over ${tgtName}`;
				break;
			case "⬇":
				title = `${srcName} gives Influence to ${tgtName}`;
				break;
			case "⬌":
				title = `${srcName} and ${tgtName}<br/>share Influence`;
				break;
			default:
				title = `${srcName} and ${tgtName}<br/>do not share Influence`;
				break;
		}

		let content = `<h6>${badge(afterSym)} ${title}</h6>`;
		if (beforeSym !== "x" && beforeSym !== afterSym) {
			content += `<b>Previous:</b> <em>${srcName}</em> ${badge(
				beforeSym
			)} <em>${tgtName}</em>`;
		}

		await ChatMessage.create({
			content,
			type: CONST.CHAT_MESSAGE_TYPES.OTHER,
		});
	}

	function requestGMApplyInfluence(payload) {
		try {
			game.socket?.emit(SOCKET_NS, payload);
		} catch (_) {
			/* symmetry sync is a fallback */
		}
	}

	async function applyInfluencePair({ actorA, tokA, actorB, tokB, directive }) {
		const useGMRelay = game.settings.get(NS, KEY_USE_GM_INFLUENCE) === true;

		if (!actorA || !actorB) return;
		if (actorA.type !== "character" || actorB.type !== "character") {
			ui.notifications?.warn?.("Influence actions are for Character ↔ Character.");
			return;
		}

		const aBefore = readInfluences(actorA);
		const bBefore = readInfluences(actorB);
		const aAfter = foundry.utils.deepClone(aBefore);
		const bAfter = foundry.utils.deepClone(bBefore);

		const nameAforB = pickStorageName(actorA, tokA);
		const nameBforA = pickStorageName(actorB, tokB);

		let aPrevSym = "—",
			aNowSym = "—";

		{
			const stA = mutateInfluenceSide(
				aAfter,
				nameBforA,
				directive === "gt"
					? "gt"
					: directive === "lt"
					? "lt"
					: directive === "eq"
					? "eq"
					: "reset"
			);
			aPrevSym = stateSymbol({
				hasInfluenceOver: stA.prev.has,
				haveInfluenceOver: stA.prev.have,
			});
			aNowSym = stateSymbol({
				hasInfluenceOver: stA.now.has,
				haveInfluenceOver: stA.now.have,
			});
		}

		{
			let whichB = "reset";
			if (directive === "gt") whichB = "lt";
			else if (directive === "lt") whichB = "gt";
			else if (directive === "eq") whichB = "eq";
			mutateInfluenceSide(bAfter, nameAforB, whichB);
		}

		const tasks = [];
		const gmPayload = {
			action: "applyPair",
			srcId: actorA.id,
			tgtId: actorB.id,
			directive,
		};

		if (canEditActor(actorA))
			tasks.push(writeInfluencesIfChanged(actorA, aBefore, aAfter));
		else if (useGMRelay) gmPayload.aAfter = aAfter;

		if (canEditActor(actorB))
			tasks.push(writeInfluencesIfChanged(actorB, bBefore, bAfter));
		else if (useGMRelay) gmPayload.bAfter = bAfter;

		if (useGMRelay && (!canEditActor(actorA) || !canEditActor(actorB))) {
			requestGMApplyInfluence(gmPayload);
		}

		try {
			await Promise.all(tasks);
		} catch (err) {
			console.error(`[${NS}] Failed to set Influence`, err);
			ui.notifications?.error?.("Couldn't update Influence (see console).");
			return;
		}

		try {
			await InfluenceIndex?.syncCharacterPairFlags?.(actorA);
		} catch (_) {
			/* no-op */
		}

		const aLabel = actorA.name ?? tokA?.document?.name ?? "A";
		await announceInfluenceChange(aLabel, nameBforA, aPrevSym, aNowSym);

		return true;
	}

	/* ----------------------------- Team Service ------------------------------ */

	const TeamService = {
		_teamDoc: null,
		_docId: null,

		async _getTeamDoc({ createIfMissing = false } = {}) {
			if (this._teamDoc && game.journal?.has(this._teamDoc.id))
				return this._teamDoc;

			const storedId = game.settings.get(NS, "teamDocId");
			if (storedId) {
				const found = game.journal?.get(storedId);
				if (found) return (this._teamDoc = found);
			}

			const fromFlag = game.journal?.find(
				(j) => j.getFlag(NS, "isTeamDoc") === true
			);
			if (fromFlag) {
				await game.settings.set(NS, "teamDocId", fromFlag.id);
				return (this._teamDoc = fromFlag);
			}

			const byName = game.journal?.find((j) => j.name === "MASKS • Team Pool");
			if (byName) {
				if (game.user.isGM && byName.getFlag(NS, "isTeamDoc") !== true) {
					await byName.setFlag(NS, "isTeamDoc", true);
				}
				await game.settings.set(NS, "teamDocId", byName.id);
				return (this._teamDoc = byName);
			}

			if (createIfMissing && game.user.isGM) {
				const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
				const data = {
					name: "MASKS • Team Pool",
					pages: [],
					ownership: { default: OWNER },
					flags: { [NS]: { isTeamDoc: true, team: 0 } },
				};
				const doc = await JournalEntry.create(data, { renderSheet: false });
				await game.settings.set(NS, "teamDocId", doc.id);
				ui.notifications?.info?.("Created Team Pool journal.");
				return (this._teamDoc = doc);
			}

			return null;
		},

		async ensureReady() {
			if (!game.user.isGM) return;
			const doc = await this._getTeamDoc({ createIfMissing: true });
			if (!doc) return;

			const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
			const defaultPerm = doc.ownership?.default ?? 0;
			if (defaultPerm !== OWNER) {
				await doc.update({
					ownership: { ...(doc.ownership ?? {}), default: OWNER },
				});
			}
		},

		get canEdit() {
			const allowBySetting = game.settings.get(NS, "playersCanEdit");
			return (
				game.user?.isGM || (allowBySetting && this._teamDoc?.isOwner === true)
			);
		},

		get value() {
			if (!this._teamDoc) return 0;
			const v = Number(this._teamDoc.getFlag(NS, "team"));
			return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
		},

		async change(
			delta,
			{ announce = true, reason = null, actorName = null } = {}
		) {
			const current = this.value;
			return this.set(current + delta, { announce, reason, actorName, delta });
		},

		async set(
			n,
			{ announce = true, reason = null, actorName = null, delta = null } = {}
		) {
			n = Math.max(0, Number.isFinite(Number(n)) ? Math.floor(Number(n)) : 0);

			this._teamDoc ??= await this._getTeamDoc();
			if (!this._teamDoc) {
				ui.notifications?.warn?.(
					"Team Pool storage not initialized. A GM must open the world."
				);
				return;
			}

			if (!this.canEdit && !game.user.isGM) {
				ui.notifications?.warn?.("You don't have permission to edit Team.");
				return;
			}

			const old = this.value;
			if (n === old) return;

			try {
				await this._teamDoc.setFlag(NS, "team", n);

				if (announce && game.settings.get(NS, "announceChanges")) {
					const d = delta ?? n - old;
					const sign = d > 0 ? "+" : "";
					const from = game.user?.name ?? "Player";

					let content = `<b>Team Pool</b>: ${old} → <b>${n}</b> (${sign}${d})`;

					if (reason === "aid" && actorName) {
						content = `<b>${foundry.utils.escapeHTML(
							from
						)}</b> spends 1 Team to aid <b>${foundry.utils.escapeHTML(
							actorName
						)}</b>! Team Pool: ${old} → <b>${n}</b>`;
					} else {
						content += ` <span class="color-muted">— ${from}</span>`;
					}

					await ChatMessage.create({
						content,
						type: CONST.CHAT_MESSAGE_TYPES.OTHER,
					});
				}

				Hooks.callAll("masksTeamUpdated");
			} catch (err) {
				console.error(`[${NS}] Failed to set Team`, err);
				ui.notifications?.error?.("Couldn't update Team pool.");
			}
		},

		async init() {
			this._teamDoc = await this._getTeamDoc();
		},
	};

	globalThis.MasksTeam = TeamService;

	/* ---------------------------------- HUD ---------------------------------- */

	const TurnCardsHUD = {
		root: null,
		_hooksRegistered: false,
		_renderQueued: false,
		_socketRegistered: false,
		_contextMenu: null,

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

			this._activateListeners();
			this._registerHooks();
			this._initSocket();

			TeamService.ensureReady().then(() => TeamService.init());

			if (game.user?.isGM)
				this.normalizeCooldowns().finally(() => this._queueRender());
			else this._queueRender();
		},

		_registerHooks() {
			if (this._hooksRegistered) return;
			this._hooksRegistered = true;

			Hooks.on("createCombat", () => this._queueRender());
			Hooks.on("deleteCombat", () => this._queueRender());

			Hooks.on("updateCombat", (doc, changes) => {
				const active = getActiveCombat();
				const isRelevant = doc?.id && active?.id && doc.id === active.id;

				const flagChanged =
					foundry.utils.getProperty(changes, `flags.${NS}.${FLAG_COOLDOWN_MAP}`) !==
					undefined;

				// Check if turn advanced in initiative tracker - this counts as a turn
				const turnChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"turn"
				);
				if (turnChanged && isRelevant && game.user?.isGM) {
					// Advance cooldowns for ALL characters (no exclusion)
					this.advanceCooldowns(null).finally(() => this._queueRender());
					return;
				}

				// Round changes - re-render but don't reset cooldowns
				const roundChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"round"
				);
				if (roundChanged && isRelevant) {
					this._queueRender();
					return;
				}

				if (flagChanged) this._queueRender();
				if (doc?.active === true || isRelevant) this._queueRender();
				if (Object.prototype.hasOwnProperty.call(changes ?? {}, "active"))
					this._queueRender();
			});

			Hooks.on("createCombatant", (cbt) => {
				if (cbt?.combat?.id !== getActiveCombat()?.id) return;
				if (game.user?.isGM)
					this.normalizeCooldowns().finally(() => this._queueRender());
				else this._queueRender();
			});

			Hooks.on("deleteCombatant", (cbt) => {
				if (cbt?.combat?.id !== getActiveCombat()?.id) return;
				if (game.user?.isGM)
					this.normalizeCooldowns().finally(() => this._queueRender());
				else this._queueRender();
			});

			Hooks.on("updateCombatant", (doc, changes) => {
				if (doc?.combat?.id !== getActiveCombat()?.id) return;
				const defeatedChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"defeated"
				);
				if (defeatedChanged) this._queueRender();
			});

			Hooks.on("updateActor", (_actor, changes) => {
				const relevantChanges = [
					"system.attributes.xp.value",
					"system.resources.forward.value",
					"system.resources.ongoing.value",
					"system.attributes.hp.value",
					"system.stats",
					`flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`,
				].some((path) => foundry.utils.getProperty(changes, path) !== undefined);

				const imgChanged = changes?.img !== undefined;
				const nameChanged = changes?.name !== undefined;

				if (relevantChanges || imgChanged || nameChanged) this._queueRender();
			});

			Hooks.on("updateJournalEntry", (doc) => {
				if (TeamService._teamDoc && doc.id === TeamService._teamDoc.id) {
					this._queueRender();
				}
			});

			Hooks.on("canvasReady", () => {
				if (!document.getElementById("masks-turncards")) this.mount();
				else this._queueRender();
			});

			Hooks.on("masksTeamUpdated", () => this._queueRender());
		},

		_initSocket() {
			if (this._socketRegistered) return;
			this._socketRegistered = true;

			try {
				game.socket?.on(SOCKET_NS, async (data) => {
					if (!data || !data.action) return;

					// GM-only actions
					if (game.user?.isGM) {
						if (data.action === "turnCardsMark") {
							const { visibleCombatantId } = data;
							if (!visibleCombatantId) return;
							await this._gmHandleMarkTurn(visibleCombatantId);
							return;
						}

						if (data.action === "turnCardsGmTurn") {
							// GM turn (from team card action or initiative advance)
							await this.advanceCooldowns(null);
							return;
						}

						if (data.action === "turnCardsForwardChange") {
							const { actorId, delta, userId, isAid, sourceActorId } = data;
							if (!actorId) return;
							await this._gmApplyForwardChange(
								actorId,
								delta,
								userId,
								isAid,
								sourceActorId
							);
							return;
						}

						if (data.action === "turnCardsShiftLabels") {
							const { targetActorId, sourceActorId, up, down, reason } = data;
							if (!targetActorId || !up || !down) return;
							await this._gmApplyShiftLabels({
								targetActorId,
								sourceActorId: sourceActorId ?? null,
								up,
								down,
								reason: reason ?? "shift",
							});
							return;
						}

						if (data.action === "turnCardsTeamChange") {
							const { delta, reason, actorName } = data;
							await TeamService.change(delta, { announce: true, reason, actorName });
							return;
						}
					}
				});
			} catch (err) {
				console.warn(
					`[${NS}] Socket unavailable; some Turn Cards relays require GM permissions.`,
					err
				);
			}
		},

		_activateListeners() {
			if (!this.root) return;
			if (this.root.dataset.bound === "1") return;

			this.root.addEventListener(
				"click",
				async (ev) => {
					const target = ev.target instanceof HTMLElement ? ev.target : null;
					if (!target) return;

					const actionEl = target.closest?.("[data-action]");
					if (actionEl) {
						const action = actionEl.dataset.action;

						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();

						await this._handleAction(action, actionEl, ev);
						return;
					}

					// Card click -> open sheet
					const card = target.closest?.(
						".turncard[data-combatant-id]:not(.turncard--team)"
					);
					if (!card) return;

					const combatantId = card.dataset.combatantId;
					const combat = getActiveCombat();
					const cbt = combat?.combatants?.get?.(combatantId);
					const actor = cbt?.actor;
					if (!actor) return;

					actor.sheet?.render?.(true);
				},
				{ capture: true }
			);

			// Right-click handlers
			this.root.addEventListener(
				"contextmenu",
				async (ev) => {
					const target = ev.target instanceof HTMLElement ? ev.target : null;
					if (!target) return;

					// Right-click potential star to subtract
					const potBtn = target.closest?.("[data-action='potential']");
					if (potBtn) {
						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();
						await this._handlePotentialClick(potBtn, -1);
						return;
					}

					// Right-click forward button to subtract
					const fwdBtn = target.closest?.("[data-action='forward']");
					if (fwdBtn) {
						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();
						await this._handleForwardClick(fwdBtn, -1, ev);
						return;
					}
				},
				{ capture: true }
			);

			// Keyboard accessibility
			this.root.addEventListener("keydown", (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target : null;
				if (!target) return;
				if (ev.key !== "Enter" && ev.key !== " ") return;

				const card = target.closest?.(".turncard[data-combatant-id]");
				if (!card) return;
				if (target.closest?.("button")) return;

				ev.preventDefault();
				card.click();
			});

			this.root.dataset.bound = "1";
		},

		async _handleAction(action, actionEl, ev) {
			switch (action) {
				case "potential":
					await this._handlePotentialClick(actionEl, +1);
					break;

				case "forward":
					await this._handleForwardClick(actionEl, +1, ev);
					break;

				case "team-action":
					// Team card action - counts as a GM/NPC turn, advances all cooldowns
					if (game.user?.isGM) {
						await this.advanceCooldowns(null);
					} else {
						this._requestGmTurn();
					}
					break;

				case "card-action": {
					const combatantId = actionEl.dataset.combatantId ?? null;
					if (!combatantId) return;

					if (game.user?.isGM) {
						await this._gmHandleMarkTurn(combatantId);
					} else {
						this._requestGmMarkTurn(combatantId);
					}
					break;
				}

				case "shift-labels":
					await this._handleShiftLabelsClick(actionEl);
					break;

				case "team-minus": {
					const step = ev.shiftKey ? -5 : -1;
					if (game.user?.isGM || TeamService.canEdit) {
						await TeamService.change(step);
					} else {
						this._requestGmTeamChange(step);
					}
					break;
				}

				case "team-plus": {
					const step = ev.shiftKey ? 5 : 1;
					if (game.user?.isGM || TeamService.canEdit) {
						await TeamService.change(step);
					} else {
						this._requestGmTeamChange(step);
					}
					break;
				}

				case "team-reset":
					if (game.user?.isGM || TeamService.canEdit) {
						await TeamService.set(0);
					} else {
						ui.notifications?.warn?.("Only the GM can reset the Team pool.");
					}
					break;
			}
		},

		_setupContextMenu() {
			const $ = globalThis.jQuery ?? globalThis.$;
			if (!$ || !this.root) return;

			if (this._contextMenu) {
				try {
					this._contextMenu.close?.();
				} catch (_) {}
				this._contextMenu = null;
			}

			const menuItems = [
				{
					name: "Gain Influence over",
					icon: '<i class="fa-solid fa-up"></i>',
					callback: (li) => this._ctxInfluence(li, "gt"),
				},
				{
					name: "Gain Synergy (mutual influence)",
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
					menuItems
				);
			} catch (err) {
				console.warn(`[${NS}] Failed to create context menu`, err);
			}
		},

		_ctxElFromLi(li) {
			if (!li) return null;
			if (li instanceof HTMLElement) return li;
			if (Array.isArray(li) && li[0] instanceof HTMLElement) return li[0];
			if (li?.[0] instanceof HTMLElement) return li[0];
			return null;
		},

		async _resolveInfluenceSource() {
			const controlled = canvas?.tokens?.controlled ?? [];
			if (controlled.length === 1 && controlled[0]?.actor) {
				return { token: controlled[0], actor: controlled[0].actor };
			}

			const myActor = game.user?.character;
			if (myActor) {
				const tok =
					(canvas.tokens?.placeables ?? []).find(
						(t) => t?.actor?.id === myActor.id
					) || null;
				return { token: tok, actor: myActor };
			}

			const owned = (canvas.tokens?.placeables ?? []).find(
				(t) => t.actor && t.actor.isOwner
			);
			if (owned) return { token: owned, actor: owned.actor };

			ui.notifications?.warn?.(
				"Select your character token or set your User Character first."
			);
			return null;
		},

		async _ctxInfluence(li, directive) {
			const el = this._ctxElFromLi(li);
			const targetActorId = el?.dataset?.actorId ?? null;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveInfluenceSource();
			if (!src?.actor) return;

			if (src.actor.id === targetActor.id) {
				ui.notifications?.warn?.(
					"Pick someone else's card to set Influence with them."
				);
				return;
			}

			const tgtTok =
				(canvas.tokens?.placeables ?? []).find(
					(t) => t?.actor?.id === targetActor.id
				) || null;

			await applyInfluencePair({
				actorA: src.actor,
				tokA: src.token ?? null,
				actorB: targetActor,
				tokB: tgtTok,
				directive,
			});
		},

		async _ctxUseInfluence(li) {
			const el = this._ctxElFromLi(li);
			const targetActorId = el?.dataset?.actorId ?? null;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveInfluenceSource();
			if (!src?.actor) return;

			if (src.actor.id === targetActor.id) {
				ui.notifications?.warn?.("You can't use Influence against yourself.");
				return;
			}

			const has = InfluenceIndex.hasEdgeFromKeyToKey(
				compositeKey(src.actor),
				compositeKey(targetActor)
			);
			if (!has) {
				ui.notifications?.warn?.(
					`You don't have Influence over ${targetActor.name}.`
				);
				return;
			}

			const picked = await promptShiftLabels(targetActor, {
				title: `Use Influence on: ${targetActor.name}`,
			});
			if (!picked) return;

			if (canEditActor(targetActor)) {
				await applyShiftLabels(targetActor, picked.up, picked.down, {
					announce: true,
					reason: "useInfluence",
					sourceActor: src.actor,
				});
			} else {
				if (!game.socket || !hasAnyActiveGM()) {
					ui.notifications?.warn?.("A GM must be online to apply that label shift.");
					return;
				}
				this._requestGmShiftLabels({
					targetActorId: targetActor.id,
					sourceActorId: src.actor.id,
					up: picked.up,
					down: picked.down,
					reason: "useInfluence",
				});
			}
		},

		async _handlePotentialClick(actionEl, delta) {
			const actorId = actionEl.dataset.actorId ?? null;
			if (!actorId) return;

			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			if (!canEditActor(actor)) {
				ui.notifications?.warn?.(
					"You don't have permission to change that character's Potential."
				);
				return;
			}

			const cur = actorPotentialValue(actor);
			const next = clampInt(cur + delta, 0, POTENTIAL_MAX);
			if (next === cur) return;

			await setActorPotential(actor, next);

			actionEl.classList.remove("is-bump");
			void actionEl.offsetHeight;
			actionEl.classList.add("is-bump");
		},

		/**
		 * Handle forward button click
		 * - Left click on own card: +1 forward to self
		 * - Left click on other's card: Aid teammate (spend 1 team, give +1 forward)
		 * - Right click: -1 forward (self only)
		 */
		async _handleForwardClick(actionEl, delta, ev) {
			const targetActorId = actionEl.dataset.actorId ?? null;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			// Determine the source (clicking user's character)
			const src = await this._resolveInfluenceSource();
			const sourceActor = src?.actor ?? null;
			const isSelf = sourceActor && sourceActor.id === targetActorId;

			// Right-click always subtracts from self only
			if (delta < 0) {
				if (!isSelf) {
					ui.notifications?.warn?.(
						"You can only remove Forward from your own character."
					);
					return;
				}
				if (!canEditActor(targetActor)) {
					ui.notifications?.warn?.(
						"You don't have permission to edit that character."
					);
					return;
				}
				await this._applyForwardChange(targetActor, delta, false, null);
				return;
			}

			// Left click (+1)
			if (isSelf) {
				// Adding forward to self
				if (!canEditActor(targetActor)) {
					ui.notifications?.warn?.(
						"You don't have permission to edit that character."
					);
					return;
				}
				await this._applyForwardChange(targetActor, delta, false, null);
			} else {
				// Aid teammate: spend 1 team, give +1 forward
				const teamValue = TeamService.value;
				if (teamValue < 1) {
					ui.notifications?.warn?.(
						"Not enough Team to aid a teammate (requires 1)."
					);
					return;
				}

				// Check if we can edit either the team pool or need GM relay
				const canEditTeam = TeamService.canEdit || game.user?.isGM;
				const canEditTarget = canEditActor(targetActor);

				if (canEditTeam && canEditTarget) {
					// We can do everything locally
					await TeamService.change(-1, {
						announce: true,
						reason: "aid",
						actorName: targetActor.name,
					});
					await this._applyForwardChange(targetActor, 1, true, sourceActor);
				} else if (game.user?.isGM) {
					// GM can always do it
					await TeamService.change(-1, {
						announce: true,
						reason: "aid",
						actorName: targetActor.name,
					});
					await this._applyForwardChange(targetActor, 1, true, sourceActor);
				} else {
					// Need GM relay
					if (!hasAnyActiveGM()) {
						ui.notifications?.warn?.("A GM must be online to aid a teammate.");
						return;
					}
					this._requestGmAidTeammate(targetActorId, sourceActor?.id);
				}
			}
		},

		async _applyForwardChange(actor, delta, isAid = false, sourceActor = null) {
			const forwardPath = "system.resources.forward.value";
			const current = getActorForward(actor);
			const next = Math.max(0, current + delta);

			if (next === current) return;

			try {
				await actor.update({ [forwardPath]: next });

				const safeName =
					foundry.utils.escapeHTML?.(actor.name ?? "Character") ??
					actor.name ??
					"Character";

				// Always announce Forward changes to chat (but not as "Aid" if it's just self-adjustment)
				const sign = delta > 0 ? "+" : "";

				if (isAid && sourceActor) {
					// Aid message is already sent by TeamService, just show the forward gain
					await ChatMessage.create({
						content: `<b>${safeName}</b> gains <b>+1 Forward</b> (now ${next}).`,
						type: CONST.CHAT_MESSAGE_TYPES.OTHER,
					});
				} else {
					await ChatMessage.create({
						content: `<b>${safeName}</b>: Forward ${current} → <b>${next}</b> (${sign}${delta})`,
						type: CONST.CHAT_MESSAGE_TYPES.OTHER,
					});
				}
			} catch (err) {
				console.error(`[${NS}] Failed to update Forward for ${actor.name}`, err);
				ui.notifications?.error?.("Couldn't update Forward (see console).");
			}
		},

		async _handleShiftLabelsClick(actionEl) {
			const actorId = actionEl.dataset.actorId ?? null;
			if (!actorId) return;

			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			if (!canEditActor(actor)) {
				ui.notifications?.warn?.(
					"You don't have permission to shift that character's Labels."
				);
				return;
			}

			// Check if any shifts are possible
			const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
			if (canShiftUp.length === 0 || canShiftDown.length === 0) {
				ui.notifications?.warn?.(
					"No valid label shifts available (all at limits)."
				);
				return;
			}

			const picked = await promptShiftLabels(actor, {
				title: `Shift Labels: ${actor.name}`,
			});
			if (!picked) return;

			await applyShiftLabels(actor, picked.up, picked.down, {
				announce: true,
				reason: "shift",
			});
		},

		async _gmApplyForwardChange(
			actorId,
			delta,
			userId = null,
			isAid = false,
			sourceActorId = null
		) {
			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			const sourceActor = sourceActorId ? game.actors?.get?.(sourceActorId) : null;

			if (isAid) {
				// Deduct team first
				await TeamService.change(-1, {
					announce: true,
					reason: "aid",
					actorName: actor.name,
				});
			}

			await this._applyForwardChange(actor, delta, isAid, sourceActor);
		},

		async _gmApplyShiftLabels({
			targetActorId,
			sourceActorId = null,
			up,
			down,
			reason = "shift",
		}) {
			const target = game.actors?.get?.(targetActorId);
			if (!target) return;

			let sourceActor = null;
			if (reason === "useInfluence" && sourceActorId) {
				sourceActor = game.actors?.get?.(sourceActorId);
				const ok =
					!!sourceActor &&
					InfluenceIndex.hasEdgeFromKeyToKey(
						compositeKey(sourceActor),
						compositeKey(target)
					);
				if (!ok) return;
			}

			await applyShiftLabels(target, up, down, {
				announce: true,
				reason,
				sourceActor,
			});
		},

		/**
		 * GM handler for when a player marks their turn
		 */
		async _gmHandleMarkTurn(combatantId) {
			const combat = getActiveCombat();
			if (!combat) return;

			const cbt = combat.combatants?.get?.(combatantId);
			if (!cbt) return;

			// Mark the actor as having acted (set cooldown)
			await this.onActorTurn(cbt.actor?.id);
			// Advance all OTHER cooldowns
			await this.advanceCooldowns(cbt.actor?.id);
		},

		_requestGmMarkTurn(combatantId) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsMark",
					visibleCombatantId: combatantId,
				});
			} catch (err) {
				console.warn(
					`[${NS}] Socket emit failed; Turn Cards mark requires GM permissions.`,
					err
				);
			}
		},

		_requestGmTurn() {
			try {
				game.socket?.emit(SOCKET_NS, { action: "turnCardsGmTurn" });
			} catch (err) {
				console.warn(
					`[${NS}] Socket emit failed; GM turn requires GM permissions.`,
					err
				);
			}
		},

		_requestGmTeamChange(delta, reason = null, actorName = null) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsTeamChange",
					delta,
					reason,
					actorName,
				});
			} catch (err) {
				console.warn(`[${NS}] Socket emit failed; Team change requires GM.`, err);
			}
		},

		_requestGmAidTeammate(targetActorId, sourceActorId) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsForwardChange",
					actorId: targetActorId,
					delta: 1,
					userId: game.user?.id ?? null,
					isAid: true,
					sourceActorId,
				});
			} catch (err) {
				console.warn(`[${NS}] Socket emit failed; Aid teammate requires GM.`, err);
			}
		},

		_requestGmShiftLabels({ targetActorId, sourceActorId, up, down, reason }) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsShiftLabels",
					targetActorId,
					sourceActorId,
					up,
					down,
					reason,
					userId: game.user?.id ?? null,
				});
			} catch (err) {
				console.warn(
					`[${NS}] Socket emit failed; Shift Labels relay requires GM.`,
					err
				);
			}
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

		_teamSizeAndMaxTurns(combat) {
			const team = getTeamCombatants(combat);
			const size = team.length;
			// Max cooldown = team size - 1 (minimum 0)
			const maxTurns = Math.max(0, size - 1);
			return { team, size, maxTurns };
		},

		_readCooldownMap(combat) {
			const raw = combat?.getFlag?.(NS, FLAG_COOLDOWN_MAP);
			if (!raw || typeof raw !== "object") return {};
			return foundry.utils.deepClone(raw);
		},

		async _writeCooldownMap(combat, mapObj) {
			if (!combat) return;
			const map = mapObj && typeof mapObj === "object" ? mapObj : {};
			const keys = Object.keys(map);

			try {
				if (!keys.length) await combat.unsetFlag(NS, FLAG_COOLDOWN_MAP);
				else await combat.setFlag(NS, FLAG_COOLDOWN_MAP, map);
			} catch (err) {
				console.warn(`[${NS}] Failed to write combat cooldown map`, err);
			}
		},

		_getRemainingFromMap(map, combatantId, maxTurns) {
			const raw = Number(map?.[combatantId] ?? NaN);
			const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
			return Math.min(n, Math.max(0, maxTurns));
		},

		/**
		 * GM-only: Clamp and normalize cooldown storage.
		 */
		async normalizeCooldowns() {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);

			let map = this._readCooldownMap(combat);
			let changed = false;

			if (maxTurns <= 0) {
				if (Object.keys(map).length) {
					map = {};
					changed = true;
				}
				if (changed) await this._writeCooldownMap(combat, map);
				return;
			}

			// Remove entries for missing combatants; clamp remaining
			const ids = new Set(team.map((c) => c.id));
			for (const [id, v] of Object.entries(map)) {
				if (!ids.has(id)) {
					delete map[id];
					changed = true;
					continue;
				}
				const n = Math.min(maxTurns, Math.max(0, Math.floor(Number(v) || 0)));
				if (n <= 0) {
					delete map[id];
					changed = true;
				} else if (n !== v) {
					map[id] = n;
					changed = true;
				}
			}

			if (changed) await this._writeCooldownMap(combat, map);
		},

		/**
		 * GM-only: Called when a character takes a turn.
		 * Sets their cooldown to teamSize - 1.
		 */
		async onActorTurn(actorId) {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				await this.normalizeCooldowns();
				return;
			}

			const acting = team.find((cbt) => cbt?.actor?.id === actorId);
			if (!acting) return;

			// Set cooldown to maxTurns (teamSize - 1)
			const map = this._readCooldownMap(combat);
			map[acting.id] = maxTurns;
			await this._writeCooldownMap(combat, map);
		},

		/**
		 * GM-only: Decrement remainingTurns for every combatant currently > 0.
		 * Characters with cooldown reaching 0 become READY again.
		 *
		 * @param {string|null} excludeActorId - Actor ID to exclude from decrement (the one who just acted)
		 */
		async advanceCooldowns(excludeActorId = null) {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				await this.normalizeCooldowns();
				return;
			}

			const map = this._readCooldownMap(combat);
			let changed = false;

			for (const cbt of team) {
				const a = cbt?.actor;
				if (!a) continue;

				// Don't decrement the actor who just acted
				if (excludeActorId && a.id === excludeActorId) continue;

				const cur = this._getRemainingFromMap(map, cbt.id, maxTurns);
				if (cur <= 0) continue;

				const next = cur - 1;
				if (next <= 0) {
					// Cooldown depleted - remove from map (ready state)
					delete map[cbt.id];
				} else {
					map[cbt.id] = next;
				}
				changed = true;
			}

			if (changed) await this._writeCooldownMap(combat, map);
		},

		async render() {
			if (!this.root) return;

			const combat = getActiveCombat();
			if (!combat) {
				this.root.style.display = "none";
				this.root.innerHTML = "";
				return;
			}

			const { team, size: teamSize, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (!team.length) {
				this.root.style.display = "none";
				this.root.innerHTML = "";
				return;
			}

			this.root.style.display = "";

			await TeamService.init();

			const teamValue = TeamService.value;
			const teamCanEdit = TeamService.canEdit || game.user?.isGM;

			const isGM = game.user?.isGM === true;
			const cooldownMap = this._readCooldownMap(combat);

			// Get the current user's actor for determining "self" vs "other"
			const myActor = game.user?.character;
			const myActorId = myActor?.id ?? null;

			const cards = team.map((cbt) => {
				const actor = cbt.actor;

				const ownsActor = canEditActor(actor);
				const ownsCombatant = canEditCombatant(cbt);
				const downed = isDowned(cbt);
				const isSelf = myActorId && actor.id === myActorId;

				const remaining = this._getRemainingFromMap(cooldownMap, cbt.id, maxTurns);
				const onCooldown = remaining > 0 && maxTurns > 0;

				// Cooldown fraction: 1 = full bar (just acted), 0 = ready
				// Bar drains right-to-left
				const cooldownFrac =
					onCooldown && maxTurns > 0
						? Math.max(0, Math.min(1, remaining / maxTurns))
						: 0;

				const potential = actorPotentialValue(actor);
				const potentialPct =
					POTENTIAL_MAX > 0
						? `${Math.round((potential / POTENTIAL_MAX) * 100)}%`
						: "0%";

				const forward = getActorForward(actor);
				const ongoing = getActorOngoing(actor);
				const effectiveBonus = forward + ongoing;

				// Status for card state
				const status = downed ? "down" : onCooldown ? "busy" : "ready";

				// Tooltip shows cooldown details
				const statusTooltip = `Cooldown: ${remaining} turn${
					remaining !== 1 ? "s" : ""
				} remaining`;

				// GMs can always take actions regardless of cooldown
				// Owners can only act when ready (cooldown === 0)
				const canMarkTurn = isGM || ownsCombatant;
				const readyToAct = !downed && !onCooldown;
				const canAction = isGM ? !downed : canMarkTurn && readyToAct;

				const actionDisabled = downed || (!isGM && !readyToAct);
				const actionAria = canAction
					? `Mark action taken for ${actor.name}`
					: downed
					? `${actor.name} is downed`
					: `${actor.name} is on cooldown`;

				const ariaLabelParts = [
					actor?.name ? `Character: ${actor.name}` : "Character",
					downed ? "Downed" : null,
					onCooldown ? `On cooldown (${remaining} turn(s))` : "Ready to act",
					`Potential ${potential} of ${POTENTIAL_MAX}`,
					effectiveBonus > 0 ? `Bonus: +${effectiveBonus}` : null,
				].filter(Boolean);

				const downedId = downed ? `turncard-downed-${cbt.id}` : null;

				// Forward button logic:
				// - Always show for all players (they can aid teammates)
				// - Show + if no bonus, show number with blue bg if bonus exists
				// - Tooltip explains the action based on self vs other
				const forwardTooltip = isSelf
					? `Forward: ${forward} | Ongoing: ${ongoing} (Click +1, Right-click -1)`
					: `Aid ${actor.name}: Spend 1 Team to give +1 Forward`;

				return {
					type: "character",
					combatantId: cbt.id,
					actorId: actor.id,
					name: actor.name ?? "UNKNOWN",
					img: actor.img ?? "",

					ariaLabel: ariaLabelParts.join(", "),

					downed,
					downedId,

					onCooldown,
					cooldownFrac: cooldownFrac.toFixed(3),

					potential,
					potentialPct,
					potentialMax: POTENTIAL_MAX,
					canEditPotential: ownsActor,

					forward,
					ongoing,
					effectiveBonus,
					showBonus: true, // Always show for everyone
					hasBonus: effectiveBonus > 0,
					canEditForward: true, // Everyone can click (self = adjust, other = aid)
					forwardTooltip,
					isSelf,

					status,
					statusTooltip,
					showStatusBar: onCooldown,

					// Action button
					actionDisabled,
					actionAria,
					canMarkTurn,

					// Shift Labels - only for owners
					canShiftLabels: ownsActor,

					isOwner: ownsActor,
				};
			});

			const context = {
				isGM,
				showTeamCard: true,
				teamSize,
				maxTurns,
				team: teamValue,
				teamCanEdit,
				cards,
			};

			const html = await renderTemplate(
				`modules/${NS}/templates/turncards.hbs`,
				context
			);
			this.root.innerHTML = html;

			this._setupContextMenu();
		},
	};

	Hooks.once("ready", () => {
		try {
			TurnCardsHUD.mount();
		} catch (err) {
			console.error(`[${NS}] Failed to mount turn cards HUD`, err);
		}
	});
})();
